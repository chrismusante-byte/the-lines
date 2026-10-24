'use client';

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { TIERS, avgOff, sumBuckets, weeklyWinners } from '../lib/charts';

const PLAYER_COLORS = ['#3d8fe8', '#f07a3c'];
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
            borderColor: PLAYER_COLORS[i % 2],
            backgroundColor: PLAYER_COLORS[i % 2],
            borderWidth: 2,
            borderDash: i === 1 ? [6, 4] : [],
            pointRadius: 4,
            pointStyle: i === 1 ? 'rectRot' : 'circle',
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
          <span className={`leg-line ${i === 1 ? 'dash' : ''}`} style={{ borderColor: PLAYER_COLORS[i % 2] }} />
          {p.name}
        </span>
      ))}
    </div>
  );
}

function Strip({ title, items, field, players }) {
  const color = (name) => {
    const i = players.findIndex((p) => p.name === name);
    return i >= 0 ? PLAYER_COLORS[i % 2] : null;
  };
  const counts = {};
  for (const it of items) counts[it[field]] = (counts[it[field]] || 0) + 1;
  const summary = [...players.map((p) => `${p.name} ${counts[p.name] || 0}`), `Tie ${counts.Tie || 0}`].join(' · ');
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
              <strong>{it[field]}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Charts({ weekly, scope, week }) {
  const { players, weeks, byWeek } = weekly;
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
        run += b.w - b.l;
        return run;
      }),
    };
  });
  const anyGraded = weeks.some((w) => players.some((p) => byWeek[w][p.id].w + byWeek[w][p.id].l + byWeek[w][p.id].p > 0));
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
            {players.map((p) => {
              const b = sumBuckets(scopeWeeks.map((w) => byWeek[w][p.id]));
              const v = avgOff(b);
              return (
                <div key={p.id} className="donut-col">
                  <Donut bucket={b} />
                  <div className="donut-name">{p.name}</div>
                  <div className="muted small">
                    {b.guessed}/{b.games} games · avg {v === null ? '—' : v.toFixed(2)} off
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card stat-card">
        <div className="stat-head">
          <h3>Weekly winner</h3>
        </div>
        <Strip title="A · Closest to Vegas" items={winners} field="vegas" players={players} />
        <Strip title="B · Best pick record" items={winners} field="picks" players={players} />
      </section>

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
    </div>
  );
}
