'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBrowserClient } from '../lib/supabase';
import { SEASON } from '../lib/nfl';
import { team } from '../lib/teams';
import { vsJoe, joeLabel } from '../lib/joe';
import { label } from '../lib/players';

const recStr = (r) => `${r.w}-${r.l}${r.p ? `-${r.p}` : ''}`;
const pct = (r) => (r.w + r.l ? `${Math.round((r.w / (r.w + r.l)) * 100)}%` : '—');
const catName = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

function Chip({ g }) {
  if (!g) return <span className="wl none">–</span>;
  return <span className={`wl ${g.res}`}>{g.res}</span>;
}

// "vs. Joe" board: Joe Fortenbaugh's real picks, graded at his number. Separate from the weekly strips.
export default function VsJoe({ rows, scope, week }) {
  const sb = getBrowserClient();
  const [picks, setPicks] = useState(null);

  useEffect(() => {
    sb.rpc('get_joe_picks', { p_season: SEASON }).then(({ data, error }) => setPicks(error ? [] : data || []));
  }, [sb]);

  const scoped = useMemo(() => (picks || []).filter((p) => scope === 'season' || p.week === week), [picks, scope, week]);
  const scopedRows = useMemo(() => (rows || []).filter((r) => scope === 'season' || r.week === week), [rows, scope, week]);
  const data = useMemo(() => vsJoe(scoped, scopedRows), [scoped, scopedRows]);

  if (!picks || picks.length === 0) return null;
  if (scoped.length === 0) {
    return (
      <section className="card stat-card">
        <div className="stat-head">
          <h3>vs. Joe</h3>
          <div className="muted small">No Joe Fortenbaugh picks loaded for this week.</div>
        </div>
      </section>
    );
  }

  const { joe, players, list } = data;
  const cats = Object.keys(joe.byCat);

  return (
    <section className="card stat-card">
      <div className="stat-head">
        <h3>vs. Joe</h3>
        <div className="muted small">Joe Fortenbaugh&apos;s picks, graded at his number. Bad bets count as fades.</div>
      </div>

      <div className="rank-line">
        <span className="rank-name">Joe</span>
        <span className="rank-big">{pct(joe.all)}</span>
      </div>
      <div className="small">
        {recStr(joe.all)} overall
        {cats.length > 1 && cats.map((c) => ` · ${catName(c)} ${recStr(joe.byCat[c])}`)}
      </div>

      {players.length > 0 && (
        <div className="joe-players">
          <div className="muted small">Your lean on the same bets (your guess vs the line you locked)</div>
          {players.map((p) => (
            <div key={p.player_id} className="joe-prow small">
              <span className="log-name">{label(p)}</span>
              <span>{recStr(p.rec)}</span>
              <span className="muted">
                agreed {p.agree}/{p.n}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="joe-list">
        {list.map((p) => (
          <div key={p.id} className="log-game">
            <div className="log-top">
              <strong>
                {team(p.away_team).abbr} @ {team(p.home_team).abbr}
              </strong>
              <span className="muted small">{catName(p.category)}</span>
            </div>
            <div className="small">
              Joe: {joeLabel(p)} {p.is_fade ? '(fade)' : ''} <Chip g={p.grade} />
              {p.grade && p.grade.res !== 'P' ? (
                <span className="muted"> by {Math.abs(p.grade.by)}</span>
              ) : null}
            </div>
            {p.others.length > 0 && (
              <div className="muted small">
                {p.others
                  .map((o) => `${o.is_bot ? '🤖 ' : ''}${o.name} ${o.agrees === null ? 'no lean' : o.agrees ? 'with Joe' : 'against'}`)
                  .join(' · ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
