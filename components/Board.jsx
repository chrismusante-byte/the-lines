'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBrowserClient } from '../lib/supabase';
import { SEASON, currentWeek, weekLabel } from '../lib/nfl';
import GameCard from './GameCard';
import PasswordModal from './PasswordModal';
import Season from './Season';

function readPref(key, fallback) {
  try {
    const v = window.localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}
function writePref(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function timeAgo(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export default function Board({ player }) {
  const sb = getBrowserClient();
  const [week, setWeek] = useState(currentWeek());
  const [mode, setMode] = useState('one');
  const [board, setBoard] = useState(null);
  const [loadErr, setLoadErr] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [idx, setIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [revealAllBusy, setRevealAllBusy] = useState(false);
  const [ctx, setCtx] = useState(null);
  const pickedStartFor = useRef(null);

  useEffect(() => {
    setMode(readPref('lines-mode', 'one'));
  }, []);

  const loadBoard = useCallback(async () => {
    const { data, error } = await sb.rpc('get_board', { p_season: SEASON, p_week: week });
    if (error) {
      setLoadErr(error.message);
      return;
    }
    setLoadErr('');
    setBoard(data);
  }, [sb, week]);

  const refreshLines = useCallback(
    async (force) => {
      setRefreshing(true);
      try {
        const { data } = await sb.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const r = await fetch('/api/refresh', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: !!force }),
        });
        const j = await r.json().catch(() => ({}));
        if (!j.ok) setNotice(j.error || 'Could not refresh lines.');
        else if (String(j.lines).startsWith('error')) setNotice(`Odds service problem — ${j.lines}`);
        else if (j.lines === 'skipped') {
          // Throttled: show the last real result if it was a failure.
          const { data: m } = await sb.rpc('board_meta');
          const last = m?.odds_result;
          if (last && last.ok === false) setNotice(`Last lines refresh failed — ${last.message}`);
          else if (force) setNotice('Lines were refreshed a few minutes ago.');
          else setNotice('');
        } else setNotice('');
      } finally {
        setRefreshing(false);
        loadBoard();
      }
    },
    [sb, loadBoard]
  );

  // Scouting data (ESPN results/injuries + weather). No betting lines in here.
  useEffect(() => {
    sb.rpc('get_context_data').then(({ data, error }) => {
      if (!error && data) setCtx(data);
    });
  }, [sb, week]);

  // Load on week change; pull fresh lines (server throttles to save API credits).
  useEffect(() => {
    setBoard(null);
    refreshLines(false);
  }, [week]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll the board so you see when your partner locks in.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') loadBoard();
    }, 15000);
    return () => clearInterval(t);
  }, [loadBoard]);

  const games = useMemo(() => board?.games || [], [board]);

  // In one-game mode, start on the first game you haven't revealed yet.
  useEffect(() => {
    if (!board || pickedStartFor.current === week) return;
    pickedStartFor.current = week;
    const i = games.findIndex((g) => !g.revealed && !g.started);
    setIdx(i >= 0 ? i : 0);
  }, [board, games, week]);

  const safeIdx = Math.min(idx, Math.max(0, games.length - 1));
  const lockedUnrevealed = games.filter((g) => {
    const mine = g.guesses.find((x) => x.is_me);
    return mine?.locked && !g.revealed && !g.started;
  });
  const revealedCount = games.filter((g) => g.revealed || g.started).length;

  function changeMode(m) {
    setMode(m);
    writePref('lines-mode', m);
  }

  async function revealAll() {
    if (lockedUnrevealed.length === 0) return;
    setRevealAllBusy(true);
    const { error } = await sb.rpc('reveal_games', { p_games: lockedUnrevealed.map((g) => g.id) });
    setRevealAllBusy(false);
    if (error) setNotice(error.message);
    loadBoard();
  }

  const meta = board?.meta;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-sm">THE LINES</div>
        <div className="weeknav">
          <button className="icon-btn" aria-label="Previous week" onClick={() => setWeek((w) => Math.max(1, w - 1))}>
            ‹
          </button>
          <div className="weeklabel">{weekLabel(week)}</div>
          <button className="icon-btn" aria-label="Next week" onClick={() => setWeek((w) => Math.min(23, w + 1))}>
            ›
          </button>
        </div>
        <div className="menu-wrap">
          <button className="icon-btn" aria-label="Menu" onClick={() => setMenuOpen((o) => !o)}>
            ☰
          </button>
          {menuOpen && (
            <div className="menu" onMouseLeave={() => setMenuOpen(false)}>
              <div className="menu-head">Signed in as {player.name}</div>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setPwOpen(true);
                }}
              >
                Change password
              </button>
              <button onClick={() => sb.auth.signOut()}>Sign out</button>
            </div>
          )}
        </div>
      </header>

      <div className="controls">
        <div className="seg">
          <button className={mode === 'one' ? 'on' : ''} onClick={() => changeMode('one')}>
            Game by game
          </button>
          <button className={mode === 'week' ? 'on' : ''} onClick={() => changeMode('week')}>
            Full week
          </button>
          <button className={mode === 'season' ? 'on' : ''} onClick={() => changeMode('season')}>
            Stats
          </button>
        </div>
        <div className="status">
          <span>Lines {timeAgo(meta?.lines_fetched_at)}</span>
          <button className="link" disabled={refreshing} onClick={() => refreshLines(true)}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {notice && <div className="notice">{notice}</div>}
      {loadErr && <div className="error pad">{loadErr}</div>}

      {mode !== 'season' && !board && !loadErr && <div className="empty">Loading {weekLabel(week)}…</div>}

      {mode === 'season' && <Season week={week} />}

      {mode !== 'season' && board && games.length === 0 && (
        <div className="empty">
          No games loaded for {weekLabel(week)} yet.
          <br />
          Lines usually post the week before. Tap Refresh to check.
        </div>
      )}

      {board && games.length > 0 && mode === 'one' && (
        <div className="one">
          <div className="pager">
            <button className="icon-btn" disabled={safeIdx === 0} onClick={() => setIdx(safeIdx - 1)} aria-label="Previous game">
              ‹
            </button>
            <div className="pager-mid">
              <div>
                Game {safeIdx + 1} of {games.length}
              </div>
              <div className="dots">
                {games.map((g, i) => {
                  const mine = g.guesses.find((x) => x.is_me);
                  const cls = g.revealed || g.started ? 'done' : mine?.locked ? 'locked' : '';
                  return (
                    <button
                      key={g.id}
                      className={`dot ${cls} ${i === safeIdx ? 'cur' : ''}`}
                      onClick={() => setIdx(i)}
                      aria-label={`Game ${i + 1}`}
                    />
                  );
                })}
              </div>
            </div>
            <button
              className="icon-btn"
              disabled={safeIdx >= games.length - 1}
              onClick={() => setIdx(safeIdx + 1)}
              aria-label="Next game"
            >
              ›
            </button>
          </div>
          <GameCard key={games[safeIdx].id} game={games[safeIdx]} onChanged={loadBoard} ctx={ctx} />
          {safeIdx < games.length - 1 && (games[safeIdx].revealed || games[safeIdx].started) && (
            <button className="btn primary block next-game" onClick={() => setIdx(safeIdx + 1)}>
              Next game ›
            </button>
          )}
        </div>
      )}

      {board && games.length > 0 && mode === 'week' && (
        <div className="list">
          {games.map((g) => (
            <GameCard key={g.id} game={g} onChanged={loadBoard} compact ctx={ctx} />
          ))}
          <div className="spacer" />
        </div>
      )}

      {board && games.length > 0 && mode === 'week' && (
        <div className="bottombar">
          <div className="bb-text">
            {revealedCount}/{games.length} revealed
          </div>
          <button className="btn primary" disabled={lockedUnrevealed.length === 0 || revealAllBusy} onClick={revealAll}>
            {revealAllBusy ? 'Revealing…' : `Reveal all locked (${lockedUnrevealed.length})`}
          </button>
        </div>
      )}

      {meta?.odds_remaining != null && <div className="footnote">Odds credits left this month: {meta.odds_remaining}</div>}

      {pwOpen && <PasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}
