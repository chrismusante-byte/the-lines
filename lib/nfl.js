import { team } from './teams';

export const SEASON = 2026;
// The app flips to the next NFL week on Tuesday morning, once Monday Night Football is over.
// Week 1 of 2026 opens Tue Sep 8, 10:00 UTC (6 AM Eastern).
const WEEK1_START_MS = Date.UTC(2026, 8, 8, 10, 0, 0);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function weekOf(date) {
  const t = new Date(date).getTime();
  if (t < WEEK1_START_MS) return 0;
  return Math.floor((t - WEEK1_START_MS) / WEEK_MS) + 1;
}

export function currentWeek() {
  const w = weekOf(Date.now());
  return Math.max(1, w);
}

export function weekLabel(w) {
  if (w <= 18) return `Week ${w}`;
  const playoff = { 19: 'Wild Card', 20: 'Divisional', 21: 'Conf. Champ.', 22: 'Pro Bowl wk', 23: 'Super Bowl' };
  return playoff[w] || `Week ${w}`;
}

export function roundHalf(x) {
  return Math.round(x * 2) / 2;
}

export function fmtNum(n) {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// home_spread < 0 means the home team is favored.
export function fmtSpread(homeSpread, home, away) {
  if (homeSpread === null || homeSpread === undefined) return '—';
  const s = Number(homeSpread);
  if (s === 0) return 'PK';
  if (s < 0) return `${team(home).abbr} −${fmtNum(-s)}`;
  return `${team(away).abbr} −${fmtNum(s)}`;
}

export function fmtSigned(n) {
  const v = Number(n);
  if (v === 0) return '0';
  return `${v > 0 ? '+' : '−'}${fmtNum(Math.abs(v))}`;
}

// Which side a guess "likes" against the Vegas line.
export function atsLean(guessHomeSpread, vegasHomeSpread) {
  if (guessHomeSpread == null || vegasHomeSpread == null) return null;
  const g = Number(guessHomeSpread);
  const v = Number(vegasHomeSpread);
  if (g < v) return 'home';
  if (g > v) return 'away';
  return 'none';
}

export function ouLean(guessTotal, vegasTotal) {
  if (guessTotal == null || vegasTotal == null) return null;
  const g = Number(guessTotal);
  const v = Number(vegasTotal);
  if (g > v) return 'over';
  if (g < v) return 'under';
  return 'none';
}

// Final-score analysis against a line. Returns null until scores exist.
export function gameResult(game, vegasHomeSpread, vegasTotal) {
  if (game.home_score == null || game.away_score == null) return null;
  const margin = game.home_score - game.away_score; // home minus away
  const actualTotal = game.home_score + game.away_score;
  const res = { margin, actualTotal, final: !!game.completed };
  if (vegasHomeSpread != null) {
    const cover = margin + Number(vegasHomeSpread); // >0 home covered
    res.coverSide = cover > 0 ? 'home' : cover < 0 ? 'away' : 'push';
    res.coverBy = Math.abs(cover);
  }
  if (vegasTotal != null) {
    const diff = actualTotal - Number(vegasTotal);
    res.ouSide = diff > 0 ? 'over' : diff < 0 ? 'under' : 'push';
    res.ouBy = Math.abs(diff);
  }
  return res;
}
