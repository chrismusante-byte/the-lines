// Weekly numbers behind the Stats charts.
// Rules (agreed with Chris):
// - Closeness uses the Vegas line at the time you locked.
// - Tiers: nailed 0, sharp 0.5-1, off 1.5-2.5, way off 3+ (spread and total alike).
// - A missed game = 2 gray "No guess" entries and a 5-point miss on spread AND total.
// - In the pick race a missed, finished game counts as 2 losses (ATS + O/U).
import { atsLean, ouLean, weekOf } from './nfl';

export const MISS_PENALTY = 5;
// Donut tiers (both "How close" charts), football scoring as the ruler (Chris, 2026-11-01):
// nailed 0-1, sharp 1.5-3 (within a FG), off 3.5-7 (within a TD), way off 7.5+.
export const TIERS = [
  { key: 'nailed', label: 'Nailed 0–1', color: '#b48cff' },
  { key: 'sharp', label: 'Sharp ≤3', color: '#4fd18b' },
  { key: 'off', label: 'Off ≤7', color: '#f5c542' },
  { key: 'way', label: 'Way off 7.5+', color: '#ff5e57' },
  { key: 'none', label: 'No guess', color: '#6b7570' },
];

export function tierOf(off) {
  const o = Math.abs(off);
  if (o <= 1) return 'nailed';
  if (o <= 3) return 'sharp';
  if (o <= 7) return 'off';
  return 'way';
}

function emptyBucket() {
  return { nailed: 0, sharp: 0, off: 0, way: 0, none: 0, offSum: 0, offN: 0, w: 0, l: 0, p: 0, games: 0, guessed: 0 };
}

function gradeResult(lean, value) {
  if (!lean || lean === 'none') return null;
  if (value === 0) return 'P';
  const won = value > 0 ? lean === 'home' || lean === 'over' : lean === 'away' || lean === 'under';
  return won ? 'W' : 'L';
}

// Week a player's stats start: the NFL week they joined (that whole week counts).
export function startWeek(p) {
  return p.joined_at ? Math.max(1, weekOf(p.joined_at)) : 1;
}

// Returns { players, weeks: [7,8,...], byWeek: {week: {playerId: bucket}} }
// A player has no bucket for weeks before they joined.
export function buildWeekly(seasonGames, rows) {
  const players = seasonGames?.players || [];
  const games = seasonGames?.games || [];
  const guessMap = new Map();
  for (const r of rows || []) guessMap.set(`${r.game_id}|${r.player_id}`, r);

  const byWeek = {};
  const actual = {}; // actual[wk][playerId | 'vegas'] = bucket, closeness to the final result
  for (const g of games) {
    const wk = g.week;
    if (!byWeek[wk]) {
      byWeek[wk] = {};
      actual[wk] = { vegas: emptyBucket() };
      for (const p of players) {
        if (startWeek(p) <= wk) {
          byWeek[wk][p.id] = emptyBucket();
          actual[wk][p.id] = emptyBucket();
        }
      }
    }
    const final = g.completed && g.home_score !== null && g.away_score !== null;
    const margin = final ? g.home_score - g.away_score : null;
    const actualTotal = final ? g.home_score + g.away_score : null;

    if (final) {
      // Vegas benchmark: the pregame (closing) line vs what happened
      const vb = actual[wk].vegas;
      vb.games++;
      if (g.close_spread != null) {
        const off = Math.abs(-Number(g.close_spread) - margin);
        vb[tierOf(off)]++;
        vb.offSum += off;
        vb.offN++;
      }
      if (g.close_total != null) {
        const off = Math.abs(Number(g.close_total) - actualTotal);
        vb[tierOf(off)]++;
        vb.offSum += off;
        vb.offN++;
      }
      for (const p of players) {
        const ab = actual[wk][p.id];
        if (!ab) continue;
        ab.games++;
        const r = guessMap.get(`${g.id}|${p.id}`);
        if (!r) {
          ab.none += 2;
          continue;
        }
        ab.guessed++;
        const offS = Math.abs(-Number(r.guess_spread) - margin);
        const offT = Math.abs(Number(r.guess_total) - actualTotal);
        ab[tierOf(offS)]++;
        ab[tierOf(offT)]++;
        ab.offSum += offS + offT;
        ab.offN += 2;
      }
    }

    for (const p of players) {
      const b = byWeek[wk][p.id];
      if (!b) continue;
      b.games++;
      const r = guessMap.get(`${g.id}|${p.id}`);
      if (!r) {
        b.none += 2;
        b.offSum += MISS_PENALTY * 2;
        b.offN += 2;
        if (final) b.l += 2;
        continue;
      }
      b.guessed++;
      const gs = Number(r.guess_spread);
      const gt = Number(r.guess_total);
      const ls = r.lock_spread === null ? null : Number(r.lock_spread);
      const lt = r.lock_total === null ? null : Number(r.lock_total);
      if (ls !== null) {
        const off = Math.abs(gs - ls);
        b[tierOf(off)]++;
        b.offSum += off;
        b.offN++;
      }
      if (lt !== null) {
        const off = Math.abs(gt - lt);
        b[tierOf(off)]++;
        b.offSum += off;
        b.offN++;
      }
      if (final) {
        const ats = ls === null ? null : gradeResult(atsLean(gs, ls), margin + ls);
        const ou = lt === null ? null : gradeResult(ouLean(gt, lt), actualTotal - lt);
        for (const res of [ats, ou]) {
          if (res === 'W') b.w++;
          else if (res === 'L') b.l++;
          else if (res === 'P') b.p++;
        }
      }
    }
  }
  const weeks = Object.keys(byWeek)
    .map(Number)
    .sort((a, b) => a - b);
  return { players, weeks, byWeek, actual };
}

export function avgOff(b) {
  return b && b.offN ? b.offSum / b.offN : null;
}

export function sumBuckets(list) {
  const t = emptyBucket();
  for (const b of list) if (b) for (const k of Object.keys(t)) t[k] += b[k] || 0;
  return t;
}

// Winner per week among players active that week.
// vegas = lowest avg points off Vegas; picks = best wins minus losses. Shared best = 'Tie'.
export function weeklyWinners(weekly) {
  if (weekly.players.length < 2) return [];
  return weekly.weeks.map((wk) => {
    const active = weekly.players.filter((p) => weekly.byWeek[wk][p.id]);
    const scored = active.map((p) => ({ p, v: avgOff(weekly.byWeek[wk][p.id]) })).filter((x) => x.v !== null);
    let vegas = '—';
    if (scored.length) {
      const best = Math.min(...scored.map((x) => x.v));
      const top = scored.filter((x) => Math.abs(x.v - best) < 1e-9);
      vegas = top.length === 1 ? top[0].p.name : 'Tie';
    }
    const graded = active.filter((p) => {
      const b = weekly.byWeek[wk][p.id];
      return b.w + b.l + b.p > 0;
    });
    let picks = '—';
    if (graded.length) {
      const diffs = active.map((p) => ({ p, d: weekly.byWeek[wk][p.id].w - weekly.byWeek[wk][p.id].l }));
      const best = Math.max(...diffs.map((x) => x.d));
      const top = diffs.filter((x) => x.d === best);
      picks = top.length === 1 ? top[0].p.name : 'Tie';
    }
    return { week: wk, vegas, picks };
  });
}

// Best human vs best bot each week (only weeks where both sides played).
// vegas: lower avg off wins. picks: higher wins-minus-losses wins.
export function humansVsBots(weekly) {
  const humans = weekly.players.filter((p) => !p.is_bot);
  const bots = weekly.players.filter((p) => p.is_bot);
  if (!humans.length || !bots.length) return null;
  const out = [];
  for (const wk of weekly.weeks) {
    const b = weekly.byWeek[wk];
    const hs = humans.filter((p) => b[p.id]);
    const bs = bots.filter((p) => b[p.id]);
    if (!hs.length || !bs.length) continue;
    const bestOff = (list) => {
      const v = list.map((p) => avgOff(b[p.id])).filter((x) => x !== null);
      return v.length ? Math.min(...v) : null;
    };
    const ho = bestOff(hs);
    const bo = bestOff(bs);
    let vegas = '—';
    if (ho !== null && bo !== null) vegas = Math.abs(ho - bo) < 1e-9 ? 'Tie' : ho < bo ? 'Humans' : 'Bots';
    const graded = [...hs, ...bs].some((p) => b[p.id].w + b[p.id].l + b[p.id].p > 0);
    let picks = '—';
    if (graded) {
      const hd = Math.max(...hs.map((p) => b[p.id].w - b[p.id].l));
      const bd = Math.max(...bs.map((p) => b[p.id].w - b[p.id].l));
      picks = hd === bd ? 'Tie' : hd > bd ? 'Humans' : 'Bots';
    }
    out.push({ week: wk, vegas, picks });
  }
  return out.length ? out : null;
}
