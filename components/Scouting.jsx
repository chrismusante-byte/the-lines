'use client';

import { team } from '../lib/teams';
import { findEspnGame, teamForm, lastMeeting, recStr } from '../lib/scouting';

const f1 = (v) => (v === null || v === undefined ? '—' : v.toFixed(1));

function TeamBlock({ ctx, name, isHome, kickoff }) {
  const t = team(name);
  const f = teamForm(ctx, name, kickoff);
  const inj = ctx.injuries?.[name]?.items || [];
  return (
    <div className="scout-team">
      <div className="scout-line">
        <span className="chip sm" style={{ '--team': t.color }}>
          {t.abbr}
        </span>
        <strong>{recStr(f.rec)}</strong>
        <span className="muted small">
          {isHome ? `Home ${recStr(f.home)}` : `Road ${recStr(f.road)}`}
        </span>
        {f.streak && <span className={`streak ${f.streak[0]}`}>{f.streak}</span>}
      </div>
      {f.n > 0 && (
        <div className="small">
          Avg {f1(f.pf)} scored · {f1(f.pa)} allowed
        </div>
      )}
      {f.last3.length > 0 && (
        <div className="last3">
          {f.last3.map((g, i) => (
            <span key={i} className="small">
              <span className={`wl ${g.res === 'T' ? 'P' : g.res}`}>{g.res}</span> {g.us}-{g.them} {g.at} {g.opp}
            </span>
          ))}
        </div>
      )}
      <div className="small inj">
        {inj.length === 0 ? (
          <span className="muted">No QB/RB/WR/TE injuries listed</span>
        ) : (
          inj.map((p, i) => (
            <span key={i} className="inj-item">
              <span className={`inj-status s-${(p.status || '').split(' ')[0].toLowerCase()}`}>{p.status}</span> {p.pos}{' '}
              {p.name}
              {p.detail ? <span className="muted"> ({p.detail})</span> : null}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function WeatherLine({ eg }) {
  if (!eg) return null;
  const place = [eg.venue, eg.venue_city].filter(Boolean).join(' · ');
  if (eg.indoor) return <div className="small">{place} · Indoors — weather not a factor</div>;
  const fc = eg.forecast;
  const ew = eg.espn_weather;
  const bits = [];
  if (fc?.temp != null) bits.push(`${Math.round(fc.temp)}°F`);
  else if (ew?.temp != null) bits.push(`${ew.temp}°F`);
  if (ew?.text) bits.push(ew.text);
  if (fc?.wind != null) bits.push(`Wind ${Math.round(fc.wind)} mph`);
  if (fc?.precip != null) bits.push(`Rain ${fc.precip}%`);
  return (
    <div className="small">
      {place} · Outdoors{eg.neutral ? ' · Neutral site' : ''}
      {bits.length ? ` · ${bits.join(' · ')}` : ' · Forecast not out yet'}
    </div>
  );
}

export default function Scouting({ ctx, game, defaultOpen }) {
  if (!ctx) return null;
  const eg = findEspnGame(ctx, game);
  const lm = lastMeeting(ctx, game.home_team, game.away_team, game.commence_time);

  let h2h = 'No meeting since 2024';
  if (lm) {
    const d = new Date(lm.game_date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    const winnerHome = lm.home_score > lm.away_score;
    const tie = lm.home_score === lm.away_score;
    const w = team(winnerHome ? lm.home_team : lm.away_team).abbr;
    const l = team(winnerHome ? lm.away_team : lm.home_team).abbr;
    const hi = Math.max(lm.home_score, lm.away_score);
    const lo = Math.min(lm.home_score, lm.away_score);
    h2h = tie ? `Last meeting: tied ${hi}-${lo} (${d})` : `Last meeting: ${w} beat ${l} ${hi}-${lo} (${d}${lm.season_type === 3 ? ', playoffs' : ''})`;
  }

  return (
    <details className="scout" open={defaultOpen}>
      <summary>Scouting report</summary>
      <div className="scout-body">
        <WeatherLine eg={eg} />
        <div className="small">{h2h}</div>
        <TeamBlock ctx={ctx} name={game.away_team} isHome={false} kickoff={game.commence_time} />
        <TeamBlock ctx={ctx} name={game.home_team} isHome kickoff={game.commence_time} />
        <div className="muted tiny">Results, injuries & venue: ESPN · Forecast: Open-Meteo</div>
      </div>
    </details>
  );
}
