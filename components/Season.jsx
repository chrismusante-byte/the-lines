'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBrowserClient } from '../lib/supabase';
import { SEASON, weekLabel, fmtNum, fmtSpread } from '../lib/nfl';
import { team } from '../lib/teams';
import { aggregate, rankBy, pct, groupByGame } from '../lib/stats';

const f1 = (v) => (v === null || v === undefined ? '—' : v.toFixed(1));
const pctStr = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const recStr = (r) => `${r.w}-${r.l}${r.p ? `-${r.p}` : ''}`;
const signed = (v) => (v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`);

function Board({ title, sub, items, render }) {
  return (
    <section className="card stat-card">
      <div className="stat-head">
        <h3>{title}</h3>
        <div className="muted small">{sub}</div>
      </div>
      {items.length === 0 ? (
        <div className="muted small">Nothing to grade yet.</div>
      ) : (
        <ol className="rank">
          {items.map((p, i) => (
            <li key={p.player_id} className={i === 0 ? 'lead' : ''}>
              <span className="rank-n">{i + 1}</span>
              <div className="rank-body">{render(p)}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Chip({ g }) {
  if (!g) return <span className="wl none">–</span>;
  return <span className={`wl ${g.res}`}>{g.res}</span>;
}

function GameLog({ rows }) {
  const games = groupByGame(rows);
  return (
    <section className="card stat-card">
      <div className="stat-head">
        <h3>Game log</h3>
        <div className="muted small">Your number vs the line you locked, the closing line, and the final</div>
      </div>
      {games.map((g) => (
        <div key={g.game_id} className="log-game">
          <div className="log-top">
            <strong>
              {team(g.away_team).abbr} @ {team(g.home_team).abbr}
            </strong>
            <span className="muted small">
              {g.final ? `Final ${g.away_score}–${g.home_score}` : g.home_score !== null ? `${g.away_score}–${g.home_score} live` : 'Awaiting score'}
            </span>
          </div>
          <div className="muted small">
            Lock→close: {fmtSpread(g.players[0].lock, g.home_team, g.away_team)} → {fmtSpread(g.close, g.home_team, g.away_team)} · O/U{' '}
            {fmtNum(g.players[0].lockT)} → {fmtNum(g.closeT)}
          </div>
          {g.players.map((p) => (
            <div key={p.player_id} className="log-row">
              <span className="log-name">{p.name}</span>
              <span>
                {fmtSpread(p.g, g.home_team, g.away_team)} <Chip g={p.atsLock} />
              </span>
              <span>
                {fmtNum(p.gt)} <Chip g={p.ouLock} />
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}

export default function Season({ week }) {
  const sb = getBrowserClient();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  const [scope, setScope] = useState('season');

  const load = useCallback(async () => {
    const { data, error } = await sb.rpc('get_season_rows', { p_season: SEASON });
    if (error) setErr(error.message);
    else {
      setErr('');
      setRows(data || []);
    }
  }, [sb]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => (rows || []).filter((r) => scope === 'season' || r.week === week), [rows, scope, week]);
  const players = useMemo(() => aggregate(filtered), [filtered]);

  if (err) return <div className="error pad">{err}</div>;
  if (!rows) return <div className="empty">Loading stats…</div>;

  const vegasRank = rankBy(players.filter((p) => p.vegasAvg !== null), 'vegasAvg', 'asc');
  const picksRank = rankBy(
    players.filter((p) => pct(p.picksLock) !== null || pct(p.picksClose) !== null),
    (p) => pct(p.picksLock) ?? pct(p.picksClose),
    'desc'
  );
  const finalRank = rankBy(players.filter((p) => p.finalAvg !== null), 'finalAvg', 'asc');
  const moveRank = players.filter((p) => p.move.tracked > 0);

  return (
    <div className="season">
      <div className="seg">
        <button className={scope === 'season' ? 'on' : ''} onClick={() => setScope('season')}>
          Season to date
        </button>
        <button className={scope === 'week' ? 'on' : ''} onClick={() => setScope('week')}>
          {weekLabel(week)}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          No graded games {scope === 'week' ? `for ${weekLabel(week)}` : 'yet'}.
          <br />
          Stats show up once a game kicks off.
        </div>
      ) : (
        <>
          <Board
            title="Closest to Vegas"
            sub="Average points off the line when you locked (lower is better)"
            items={vegasRank}
            render={(p) => (
              <>
                <div className="rank-line">
                  <span className="rank-name">{p.name}</span>
                  <span className="rank-big">{f1(p.vegasAvg)}</span>
                </div>
                <div className="muted small">
                  Spread {f1(p.vegasAvgS)} · Total {f1(p.vegasAvgT)} · Nailed {p.vegas.nailedS + p.vegas.nailedT} · {p.games} games
                </div>
              </>
            )}
          />

          <Board
            title="Pick record"
            sub="Your number vs the line: which side you'd take. Ranked on the line you locked."
            items={picksRank}
            render={(p) => (
              <>
                <div className="rank-line">
                  <span className="rank-name">{p.name}</span>
                  <span className="rank-big">{pctStr(pct(p.picksLock))}</span>
                </div>
                <div className="pick-grid">
                  <span className="muted small">At lock</span>
                  <span className="small">ATS {recStr(p.atsLock)}</span>
                  <span className="small">O/U {recStr(p.ouLock)}</span>
                  <span className="small">{signed(p.pickMarginLock)}</span>
                  <span className="muted small">At close</span>
                  <span className="small">ATS {recStr(p.atsClose)}</span>
                  <span className="small">O/U {recStr(p.ouClose)}</span>
                  <span className="small">{signed(p.pickMarginClose)}</span>
                </div>
                <div className="muted small">Last column: avg points your picks won (+) or lost (−) by</div>
              </>
            )}
          />

          <Board
            title="Closest to final"
            sub="Average points off the real margin and total (lower is better)"
            items={finalRank}
            render={(p) => (
              <>
                <div className="rank-line">
                  <span className="rank-name">{p.name}</span>
                  <span className="rank-big">{f1(p.finalAvg)}</span>
                </div>
                <div className="muted small">
                  Margin {f1(p.finalAvgS)} · Total {f1(p.finalAvgT)} · {p.final.n} finals
                </div>
              </>
            )}
          />

          <section className="card stat-card">
            <div className="stat-head">
              <h3>Line movement</h3>
              <div className="muted small">From the line when you locked to the closing line</div>
            </div>
            {moveRank.length === 0 ? (
              <div className="muted small">Nothing tracked yet.</div>
            ) : (
              moveRank.map((p) => (
                <div key={p.player_id} className="move-row">
                  <div className="rank-name">{p.name}</div>
                  <div className="small">
                    Spread moved in {p.move.nS} of {p.move.tracked} games
                    {p.move.nS ? `, avg ${f1(p.move.absS / p.move.nS)} pts — toward your number ${p.move.towardS}, away ${p.move.awayS}` : ''}
                  </div>
                  <div className="small">
                    Total moved in {p.move.nT} of {p.move.tracked} games
                    {p.move.nT ? `, avg ${f1(p.move.absT / p.move.nT)} pts — toward your number ${p.move.towardT}, away ${p.move.awayT}` : ''}
                  </div>
                </div>
              ))
            )}
          </section>

          {scope === 'week' && <GameLog rows={filtered} />}
        </>
      )}
    </div>
  );
}
