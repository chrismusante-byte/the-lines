'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { TIERS, avgOff, sumBuckets, weeklyWinners, humansVsBots } from '../lib/charts';
import { label } from '../lib/players';

const PLAYER_COLORS = ['#3d8fe8', '#f07a3c', '#2ec4b6', '#e8c13d', '#c58cf2'];
const DASHES = [[], [6, 4], [2, 3], [10, 3, 2, 3], [1, 4]];
const LEG_STYLE = ['solid', 'dashed', 'dotted', 'dashed', 'dotted'];
const POINTS = ['circle', 'rectRot', 'triangle', 'rect', 'star'];
const N = PLAYER_COLORS.length;
const GRID = '#26322d';
const TICK = '#93a39b';
const SURFACE = '#18211d';

// Draws "%"-labels on donut slices that are big enough to fit text.
const pctLabels = {
  id: 'pctLabels',
  afterDatasetDraw(chart) {
    const ds = chart.data.datasets[0];
    const total = ds.data.reduce((a, b) => a + b, 0);
    if (!total) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = '700 12px Barlow, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    meta.data.forEach((arc, i) => {
      const v = ds.data[i];
      const pct = Math.round((v / total) * 100);
      if (pct < 7) return;
      const { x, y } = arc.tooltipPosition();
      ctx.fillStyle = '#10140f';
      ctx.fillText(`${pct}%`, x, y);
    });
    ctx.restore();
  },
};

function useChart(build, deps) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const chart = build(ref.current);
    return () => chart.destroy();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

function Donut({ bucket }) {
  const data = TIERS.map((t) => bucket[t.key]);
  const ref = useChart(
    (el) =>
      new Chart(el, {
        type: 'doughnut',
        data: {
          labels: TIERS.map((t) => t.label),
          datasets: [{ data, backgroundColor: TIERS.map((t) => t.color), borderColor: SURFACE, borderWidth: 2 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '55%',
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => {
                  const total = c.dataset.data.reduce((a, b) => a + b, 0);
                  return ` ${c.label}: ${c.raw} (${total ? Math.round((c.raw / total) * 100) : 0}%)`;
                },
              },
            },
          },
        },
        plugins: [pctLabels],
      }),
    [JSON.stringify(data)]
  );
  return (
    <div className="donut-wrap">
      <canvas ref={ref} role="img" aria-label="Closeness to Vegas breakdown" />
    </div>
  );
}

function LineChart({ labels, series, reverse, signed }) {
  const ref = useChart(
    (el) =>
      new Chart(el, {
        type: 'line',
        data: {
          labels,
          datasets: series.map((s, i) => ({
            label: s.name,
            data: s.data,
            borderColor: PLAYER_COLORS[i % N],
            backgroundColor: PLAYER_COLORS[i % N],
            borderWidth: 2,
            borderDash: DASHES[i % N],
            pointRadius: 4,
            pointStyle: POINTS[i % N],
            tension: 0.25,
            spanGaps: true,
          })),
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) =>
                  ` ${c.dataset.label}: ${
                    c.raw === null ? '—' : signed ? `${c.raw > 0 ? '+' : ''}${c.raw}` : Number(c.raw).toFixed(2)
                  }`,
              },
            },
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: TICK } },
            y: {
              reverse: !!reverse,
              grid: { color: GRID },
              ticks: { color: TICK, callback: (v) => (signed ? `${v > 0 ? '+' : ''}${v}` : Number(v).toFixed(1)) },
            },
          },
        },
      }),
    [JSON.stringify(labels), JSON.stringify(series), reverse, signed]
  );
  return (
    <div className="line-wrap">
      <canvas ref={ref} role="img" aria-label="Weekly trend by player" />
    </div>
  );
}

function Legend({ players }) {
  return (
    <div className="chart-legend">
      {players.map((p, i) => (
        <span key={p.id}>
          <span className="leg-line" style={{ borderColor: PLAYER_COLORS[i % N], borderTopStyle: LEG_STYLE[i % N] }} />
          {label(p)}
        </span>
      ))}
    </div>
  );
}

function shortName(name, players) {
  const p = players.find((x) => x.name === name);
  if (!p || !p.is_bot) return name;
  return `🤖 ${name.replace(/^AI /, '')}`;
}

function HumansVsBots({ weekly }) {
  const hvb = humansVsBots(weekly);
  if (!hvb) return null;
  const tally = (field) => {
    const c = { Humans: 0, Bots: 0, Tie: 0 };
    for (const w of hvb) if (c[w[field]] !== undefined) c[w[field]]++;
    return c;
  };
  const row = (title, field) => {
    const c = tally(field);
    return (
      <div className="strip-block">
        <div className="small muted">
          {title} · Humans {c.Humans} · Bots {c.Bots} · Tie {c.Tie}
        </div>
        <div className="strip">
          {hvb.map((w) => (
            <div
              key={w.week}
              className="strip-cell"
              style={w[field] === 'Humans' ? { background: '#3d8fe8', color: '#fff' } : w[field] === 'Bots' ? { background: '#7a6a9e', color: '#fff' } : undefined}
            >
              W{w.week}
              <br />
              <strong>{w[field] === 'Bots' ? '🤖' : w[field] === 'Humans' ? '🧑' : w[field]}</strong>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <section className="card stat-card">
      <div className="stat-head">
        <h3>Humans vs. Bots</h3>
        <div className="muted small">Best human vs best bot each week</div>
      </div>
      {row('Closest to Vegas', 'vegas')}
      {row('Best pick record', 'picks')}
    </section>
  );
}

function Strip({ title, items, field, players }) {
  const color = (name) => {
    const i = players.findIndex((p) => p.name === name);
    return i >= 0 ? PLAYER_COLORS[i % N] : null;
  };
  const counts = {};
  for (const it of items) counts[it[field]] = (counts[it[field]] || 0) + 1;
  const summary = [...players.map((p) => `${label(p)} ${counts[p.name] || 0}`), `Tie ${counts.Tie || 0}`].join(' · ');
  return (
    <div className="strip-block">
      <div className="small muted">
        {title} · {summary}
      </div>
      <div className="strip">
        {items.map((it) => {
          const c = color(it[field]);
          return (
            <div key={it.week} className="strip-cell" style={c ? { background: c, color: '#fff' } : undefined}>
              W{it.week}
              <br />
              <strong>{shortName(it[field], players)}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Charts({ weekly, scope, week }) {
  const { players, weeks, byWeek, actual } = weekly;
  if (!players.length || !weeks.length) return null;

  const scopeWeeks = scope === 'week' ? weeks.filter((w) => w === week) : weeks;
  const winners = weeklyWinners(weekly);

  const trend = players.map((p) => ({
    name: p.name,
    data: weeks.map((w) => {
      const v = avgOff(byWeek[w][p.id]);
      return v === null ? null : Math.round(v * 100) / 100;
    }),
  }));

  const race = players.map((p) => {
    let run = 0;
    return {
      name: p.name,
      data: weeks.map((w) => {
        const b = byWeek[w][p.id];
        if (!b) return null;
        run += b.w - b.l;
        return run;
      }),
    };
  });
  const bvRace = players.map((p) => {
    let run = 0;
    return {
      name: p.name,
      data: weeks.map((w) => {
        const b = actual?.[w]?.[p.id];
        if (!b) return null;
        run += b.bvW - b.bvL;
        return run;
      }),
    };
  });
  const anyBv = weeks.some((w) => players.some((p) => {
    const b = actual?.[w]?.[p.id];
    return b && b.bvW + b.bvL + b.bvT > 0;
  }));
  const anyGraded = weeks.some((w) =>
    players.some((p) => {
      const b = byWeek[w][p.id];
      return b && b.w + b.l + b.p > 0;
    })
  );
  const labels = weeks.map((w) => `W${w}`);

  return (
    <div className="charts">
      {scopeWeeks.length > 0 && (
        <section className="card stat-card">
          <div className="stat-head">
            <h3>How close to Vegas</h3>
            <div className="muted small">
              {scope === 'week' ? `Week ${week}` : 'Season to date'} · every spread and total guess · missed games show as No guess
            </div>
          </div>
          <div className="tier-legend">
            {TIERS.map((t) => (
              <span key={t.key}>
                <span className="sq" style={{ background: t.color }} />
                {t.label}
              </span>
            ))}
          </div>
          <div className="donuts">
            {players.filter((p) => scopeWeeks.some((w) => byWeek[w][p.id])).map((p) => {
              const b = sumBuckets(scopeWeeks.map((w) => byWeek[w][p.id]));
              const v = avgOff(b);
              return (
                <div key={p.id} className="donut-col">
                  <Donut bucket={b} />
                  <div className="donut-name">{label(p)}</div>
                  <div className="muted small">
                    {b.guessed}/{b.games} games · avg {v === null ? '—' : v.toFixed(2)} off
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {scopeWeeks.length > 0 && (
        <section className="card stat-card">
          <div className="stat-head">
            <h3>How close to actual</h3>
            <div className="muted small">
              {scope === 'week' ? `Week ${week}` : 'Season to date'} · spread vs the final margin, total vs the final
              score · finished games only · Vegas = pregame line
            </div>
          </div>
          <div className="tier-legend">
            {TIERS.map((t) => (
              <span key={t.key}>
                <span className="sq" style={{ background: t.color }} />
                {t.label}
              </span>
            ))}
          </div>
          {(() => {
            const vb = sumBuckets(scopeWeeks.map((w) => actual?.[w]?.vegas));
            if (!vb.games) return <div className="muted small">Fills in once games go final.</div>;
            const cols = [
              ...players
                .filter((p) => scopeWeeks.some((w) => actual?.[w]?.[p.id]))
                .map((p) => ({ key: p.id, name: label(p), b: sumBuckets(scopeWeeks.map((w) => actual?.[w]?.[p.id])) })),
              { key: 'vegas', name: '🎰 Vegas', b: vb },
            ];
            return (
              <div className="donuts">
                {cols.map((c) => {
                  const v = avgOff(c.b);
                  return (
                    <div key={c.key} className="donut-col">
                      <Donut bucket={c.b} />
                      <div className="donut-name">{c.name}</div>
                      <div className="muted small">
                        {c.key === 'vegas' ? c.b.games : c.b.guessed}/{c.b.games} finals · avg {v === null ? '—' : v.toFixed(1)} off
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}

      <section className="card stat-card">
        <div className="stat-head">
          <h3>Weekly winner</h3>
        </div>
        <Strip title="A · Closest to Vegas" items={winners} field="vegas" players={players} />
        <Strip title="B · Best pick record" items={winners} field="picks" players={players} />
        <Strip title="C · Beat Vegas (closer to the result than the pregame line)" items={winners} field="beat" players={players} />
      </section>

      <HumansVsBots weekly={weekly} />

      <section className="card stat-card">
        <div className="stat-head">
          <h3>Season trend</h3>
          <div className="muted small">Avg points off Vegas each week · higher on the chart = closer · misses count 5</div>
        </div>
        <Legend players={players} />
        <LineChart labels={labels} series={trend} reverse />
      </section>

      <section className="card stat-card">
        <div className="stat-head">
          <h3>Pick race</h3>
          <div className="muted small">Running wins minus losses (ATS + O/U) · missed games count as losses</div>
        </div>
        {anyGraded ? (
          <>
            <Legend players={players} />
            <LineChart labels={labels} series={race} signed />
          </>
        ) : (
          <div className="muted small">Fills in once games go final.</div>
        )}
      </section>

      <section className="card stat-card">
        <div className="stat-head">
          <h3>Beat Vegas race</h3>
          <div className="muted small">
            Running wins minus losses vs the pregame line (closer to the actual result) · above 0 = out-predicting Vegas · missed finals count as 2 losses
          </div>
        </div>
        {anyBv ? (
          <>
            <Legend players={players} />
            <LineChart labels={labels} series={bvRace} signed />
          </>
        ) : (
          <div className="muted small">Fills in once games go final.</div>
        )}
      </section>
    </div>
  );
}
