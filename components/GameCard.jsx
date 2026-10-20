'use client';

import { useState } from 'react';
import { getBrowserClient } from '../lib/supabase';
import { team, isDivisional, isConference } from '../lib/teams';
import { fmtNum, fmtSpread, fmtSigned, atsLean, ouLean, gameResult } from '../lib/nfl';
import Scouting from './Scouting';

function kickoff(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function TeamChip({ name, big }) {
  const t = team(name);
  return (
    <span className={`chip ${big ? 'big' : ''}`} style={{ '--team': t.color }}>
      {t.abbr}
    </span>
  );
}

function sideAbbr(side, game) {
  if (side === 'home') return team(game.home_team).abbr;
  if (side === 'away') return team(game.away_team).abbr;
  return null;
}

function GuessForm({ game, mine, onSaved }) {
  const sb = getBrowserClient();
  const initFav =
    mine?.home_spread == null ? '' : Number(mine.home_spread) < 0 ? 'home' : Number(mine.home_spread) > 0 ? 'away' : 'pk';
  const [fav, setFav] = useState(initFav);
  const [pts, setPts] = useState(mine?.home_spread == null || Number(mine.home_spread) === 0 ? '' : String(Math.abs(mine.home_spread)));
  const [tot, setTot] = useState(mine?.total == null ? '' : String(mine.total));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const home = team(game.home_team).abbr;
  const away = team(game.away_team).abbr;

  function isHalfStep(n) {
    return Number.isFinite(n) && Math.round(n * 2) === n * 2;
  }

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (!fav) return setErr('Pick the favorite (or PK).');
    let homeSpread = 0;
    if (fav !== 'pk') {
      const n = Number(pts);
      if (!pts || !isHalfStep(n) || n <= 0 || n > 40) return setErr('Spread: enter a number like 3 or 6.5.');
      homeSpread = fav === 'home' ? -n : n;
    }
    const t = Number(tot);
    if (!tot || !isHalfStep(t) || t < 10 || t > 99) return setErr('Total: enter a number like 44.5.');
    setBusy(true);
    const { error } = await sb.rpc('lock_guess', { p_game: game.id, p_home_spread: homeSpread, p_total: t });
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  }

  const clear = () => setErr('');

  return (
    <form className="guess" onSubmit={save}>
      <div className="g-label">Who&apos;s favored?</div>
      <div className="seg three">
        <button type="button" className={fav === 'away' ? 'on' : ''} onClick={() => (setFav('away'), clear())}>
          {away}
        </button>
        <button type="button" className={fav === 'pk' ? 'on' : ''} onClick={() => (setFav('pk'), clear())}>
          PK
        </button>
        <button type="button" className={fav === 'home' ? 'on' : ''} onClick={() => (setFav('home'), clear())}>
          {home}
        </button>
      </div>
      <div className="inputs">
        <label className="field">
          <span>Spread {fav && fav !== 'pk' ? `(${fav === 'home' ? home : away} by)` : ''}</span>
          <input
            inputMode="decimal"
            placeholder={fav === 'pk' ? 'PK' : '3.5'}
            disabled={fav === 'pk'}
            value={fav === 'pk' ? '' : pts}
            onChange={(e) => (setPts(e.target.value), clear())}
          />
        </label>
        <label className="field">
          <span>Total (O/U)</span>
          <input inputMode="decimal" placeholder="44.5" value={tot} onChange={(e) => (setTot(e.target.value), clear())} />
        </label>
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn primary block" type="submit" disabled={busy}>
        {busy ? 'Saving…' : mine?.locked ? 'Update my guess' : 'Lock my guess'}
      </button>
    </form>
  );
}

function RevealedView({ game }) {
  const v = game.vegas;
  const res = gameResult(game, v?.home_spread, v?.total);
  const moved =
    v &&
    (Number(v.open_home_spread) !== Number(v.home_spread) || Number(v.open_total) !== Number(v.total)) &&
    v.open_home_spread != null;

  return (
    <div className="revealed">
      <div className="vegas">
        <div className="v-label">Vegas</div>
        {v && v.home_spread != null ? (
          <div className="v-line">
            <span className="v-num">{fmtSpread(v.home_spread, game.home_team, game.away_team)}</span>
            <span className="v-sep">·</span>
            <span className="v-num">O/U {fmtNum(v.total)}</span>
          </div>
        ) : (
          <div className="v-line muted">No line posted yet</div>
        )}
        {v?.books ? <div className="v-sub">Median of {v.books} US books</div> : null}
        {moved && (
          <div className="v-sub">
            Moved from {fmtSpread(v.open_home_spread, game.home_team, game.away_team)} / {fmtNum(v.open_total)} since we first saw it
          </div>
        )}
      </div>

      {res && (
        <div className="result">
          <div className="v-label">{res.final ? 'Final' : 'In progress'}</div>
          <div className="r-score">
            {team(game.away_team).abbr} {game.away_score} – {game.home_score} {team(game.home_team).abbr}
          </div>
          {res.coverSide && (
            <div className="r-line">
              {res.coverSide === 'push'
                ? 'Spread: push'
                : `Spread: ${sideAbbr(res.coverSide, game)} covered by ${fmtNum(res.coverBy)}`}
            </div>
          )}
          {res.ouSide && (
            <div className="r-line">
              {res.ouSide === 'push'
                ? `Total ${res.actualTotal}: push`
                : `Total ${res.actualTotal}: ${res.ouSide === 'over' ? 'Over' : 'Under'} by ${fmtNum(res.ouBy)}`}
            </div>
          )}
        </div>
      )}

      <div className="who">
        {game.guesses.map((g) => {
          if (!g.locked) {
            return (
              <div className="who-row" key={g.player_id}>
                <div className="who-name">{g.is_me ? 'You' : g.name}</div>
                <div className="muted">{g.revealed || game.started ? 'No guess' : 'Hasn’t locked yet'}</div>
              </div>
            );
          }
          if (g.home_spread == null) {
            return (
              <div className="who-row" key={g.player_id}>
                <div className="who-name">{g.is_me ? 'You' : g.name}</div>
                <div className="muted">Locked ✓</div>
              </div>
            );
          }
          const lineAtLock = g.vegas_home_spread_at_lock ?? v?.home_spread;
          const totalAtLock = g.vegas_total_at_lock ?? v?.total;
          const sOff = v?.home_spread != null ? Math.abs(Number(g.home_spread) - Number(v.home_spread)) : null;
          const tOff = v?.total != null ? Number(g.total) - Number(v.total) : null;
          const ats = atsLean(g.home_spread, lineAtLock);
          const ou = ouLean(g.total, totalAtLock);
          let atsRes = null;
          let ouRes = null;
          let spreadErr = null;
          let totalErr = null;
          if (res?.final) {
            if (res.coverSide && ats && ats !== 'none') atsRes = res.coverSide === 'push' ? 'P' : res.coverSide === ats ? 'W' : 'L';
            if (res.ouSide && ou && ou !== 'none') ouRes = res.ouSide === 'push' ? 'P' : res.ouSide === ou ? 'W' : 'L';
            spreadErr = Math.abs(-Number(g.home_spread) - res.margin);
            totalErr = Math.abs(Number(g.total) - res.actualTotal);
          }
          return (
            <div className="who-row" key={g.player_id}>
              <div className="who-name">{g.is_me ? 'You' : g.name}</div>
              <div className="who-cols">
                <div>
                  <div className="who-num">{fmtSpread(g.home_spread, game.home_team, game.away_team)}</div>
                  <div className="who-sub">{sOff === null ? '' : sOff === 0 ? 'Nailed Vegas' : `${fmtNum(sOff)} off Vegas`}</div>
                  <div className="who-sub">
                    {ats === 'none' ? 'No ATS lean' : ats ? `Likes ${sideAbbr(ats, game)} ATS` : ''}
                    {atsRes && <span className={`wl ${atsRes}`}>{atsRes}</span>}
                  </div>
                  {spreadErr !== null && <div className="who-sub">{fmtNum(spreadErr)} off final margin</div>}
                </div>
                <div>
                  <div className="who-num">{fmtNum(g.total)}</div>
                  <div className="who-sub">{tOff === null ? '' : tOff === 0 ? 'Nailed Vegas' : `${fmtSigned(tOff)} vs Vegas`}</div>
                  <div className="who-sub">
                    {ou === 'none' ? 'No O/U lean' : ou ? (ou === 'over' ? 'Likes Over' : 'Likes Under') : ''}
                    {ouRes && <span className={`wl ${ouRes}`}>{ouRes}</span>}
                  </div>
                  {totalErr !== null && <div className="who-sub">{fmtNum(totalErr)} off final total</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GameCard({ game, onChanged, compact, ctx }) {
  const sb = getBrowserClient();
  const [skipArmed, setSkipArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const mine = game.guesses.find((g) => g.is_me);
  const others = game.guesses.filter((g) => !g.is_me);
  const showReveal = game.revealed || game.started;
  const divisional = isDivisional(game.home_team, game.away_team);
  const conference = !divisional && isConference(game.home_team, game.away_team);

  async function reveal() {
    if (!mine?.locked && !skipArmed) {
      setSkipArmed(true);
      return;
    }
    setBusy(true);
    const { error } = await sb.rpc('reveal_games', { p_games: [game.id] });
    setBusy(false);
    if (error) return setErr(error.message);
    onChanged();
  }

  return (
    <article className={`card ${compact ? 'compact' : ''} ${showReveal ? 'is-revealed' : ''}`}>
      <div className="matchup">
        <div className="team-side">
          <TeamChip name={game.away_team} big={!compact} />
          <div className="team-name">{game.away_team}</div>
        </div>
        <div className="at">@</div>
        <div className="team-side right">
          <TeamChip name={game.home_team} big={!compact} />
          <div className="team-name">{game.home_team}</div>
        </div>
      </div>
      <div className="tags">
        <span className="tag">{kickoff(game.commence_time)}</span>
        {divisional && <span className="tag hot">Divisional</span>}
        {conference && <span className="tag">Conference</span>}
        {game.started && !game.completed && <span className="tag live">Kicked off</span>}
        {game.completed && <span className="tag">Final</span>}
      </div>

      <Scouting ctx={ctx} game={game} defaultOpen={!compact && !showReveal} />

      {!showReveal && (
        <>
          <GuessForm key={mine?.locked_at || 'new'} game={game} mine={mine} onSaved={onChanged} />
          {mine?.locked && <div className="ok">Locked ✓ You can still change it until you reveal.</div>}
          <div className="others">
            {others.map((o) => (
              <span key={o.player_id} className={`pill ${o.locked ? 'yes' : ''}`}>
                {o.name}: {o.locked ? 'locked ✓' : 'thinking…'}
              </span>
            ))}
          </div>
          {err && <div className="error">{err}</div>}
          <button className={`btn reveal block ${skipArmed ? 'warn' : ''}`} onClick={reveal} disabled={busy}>
            {busy
              ? 'Revealing…'
              : mine?.locked
              ? 'Reveal the line'
              : skipArmed
              ? 'Tap again: skip guessing & reveal'
              : 'Reveal without guessing'}
          </button>
        </>
      )}

      {showReveal && <RevealedView game={game} />}
    </article>
  );
}
