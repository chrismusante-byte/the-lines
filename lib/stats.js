import { atsLean, ouLean } from './nfl';

const num = (v) => (v === null || v === undefined ? null : Number(v));

function grade(lean, value) {
  // value > 0 means home covered / over hit; 0 = push
  if (!lean || lean === 'none') return null;
  if (value === 0) return { res: 'P', by: 0 };
  const sideWon = value > 0 ? (lean === 'home' || lean === 'over') : (lean === 'away' || lean === 'under');
  return { res: sideWon ? 'W' : 'L', by: sideWon ? Math.abs(value) : -Math.abs(value) };
}

// Enrich one guess row with everything we can compute about it.
export function analyzeRow(r) {
  const g = num(r.guess_spread);
  const gt = num(r.guess_total);
  const lock = num(r.lock_spread);
  const lockT = num(r.lock_total);
  const close = num(r.close_spread);
  const closeT = num(r.close_total);
  const out = { ...r, g, gt, lock, lockT, close, closeT };

  if (lock !== null) {
    out.offVegasSpread = Math.abs(g - lock);
    out.nailedSpread = g === lock;
  }
  if (lockT !== null) {
    out.offVegasTotal = Math.abs(gt - lockT);
    out.nailedTotal = gt === lockT;
  }

  // Line movement from your lock to kickoff
  if (lock !== null && close !== null) {
    out.moveSpread = close - lock;
    if (out.moveSpread !== 0) out.spreadToward = Math.abs(g - close) < Math.abs(g - lock);
  }
  if (lockT !== null && closeT !== null) {
    out.moveTotal = closeT - lockT;
    if (out.moveTotal !== 0) out.totalToward = Math.abs(gt - closeT) < Math.abs(gt - lockT);
  }

  const final = r.completed && r.home_score !== null && r.away_score !== null;
  out.final = final;
  if (final) {
    const margin = r.home_score - r.away_score;
    const actualTotal = r.home_score + r.away_score;
    out.margin = margin;
    out.actualTotal = actualTotal;
    out.offFinalSpread = Math.abs(-g - margin);
    out.offFinalTotal = Math.abs(gt - actualTotal);
    if (lock !== null) out.atsLock = grade(atsLean(g, lock), margin + lock);
    if (close !== null) out.atsClose = grade(atsLean(g, close), margin + close);
    if (lockT !== null) out.ouLock = grade(ouLean(gt, lockT), actualTotal - lockT);
    if (closeT !== null) out.ouClose = grade(ouLean(gt, closeT), actualTotal - closeT);
  }
  return out;
}

function rec() {
  return { w: 0, l: 0, p: 0, byTotal: 0, byN: 0 };
}
function addRec(rc, gr) {
  if (!gr) return;
  if (gr.res === 'W') rc.w++;
  else if (gr.res === 'L') rc.l++;
  else rc.p++;
  rc.byTotal += gr.by;
  rc.byN++;
}
export function pct(rc) {
  const d = rc.w + rc.l;
  return d === 0 ? null : rc.w / d;
}
function avg(sum, n) {
  return n === 0 ? null : sum / n;
}

export function aggregate(rows) {
  const by = new Map();
  for (const raw of rows) {
    const r = analyzeRow(raw);
    if (!by.has(r.player_id)) {
      by.set(r.player_id, {
        player_id: r.player_id,
        name: r.name,
        games: 0,
        vegas: { sS: 0, nS: 0, sT: 0, nT: 0, nailedS: 0, nailedT: 0 },
        final: { sS: 0, sT: 0, n: 0 },
        atsLock: rec(),
        atsClose: rec(),
        ouLock: rec(),
        ouClose: rec(),
        move: { nS: 0, absS: 0, towardS: 0, awayS: 0, nT: 0, absT: 0, towardT: 0, awayT: 0, tracked: 0 },
      });
    }
    const p = by.get(r.player_id);
    p.games++;
    if (r.offVegasSpread !== undefined) {
      p.vegas.sS += r.offVegasSpread;
      p.vegas.nS++;
      if (r.nailedSpread) p.vegas.nailedS++;
    }
    if (r.offVegasTotal !== undefined) {
      p.vegas.sT += r.offVegasTotal;
      p.vegas.nT++;
      if (r.nailedTotal) p.vegas.nailedT++;
    }
    if (r.final) {
      p.final.sS += r.offFinalSpread;
      p.final.sT += r.offFinalTotal;
      p.final.n++;
      addRec(p.atsLock, r.atsLock);
      addRec(p.atsClose, r.atsClose);
      addRec(p.ouLock, r.ouLock);
      addRec(p.ouClose, r.ouClose);
    }
    if (r.moveSpread !== undefined) {
      p.move.tracked++;
      if (r.moveSpread !== 0) {
        p.move.nS++;
        p.move.absS += Math.abs(r.moveSpread);
        if (r.spreadToward) p.move.towardS++;
        else p.move.awayS++;
      }
    }
    if (r.moveTotal !== undefined && r.moveTotal !== 0) {
      p.move.nT++;
      p.move.absT += Math.abs(r.moveTotal);
      if (r.totalToward) p.move.towardT++;
      else p.move.awayT++;
    }
  }

  const players = [...by.values()].map((p) => {
    const v = p.vegas;
    const combinedPicks = (a, b) => ({ w: a.w + b.w, l: a.l + b.l, p: a.p + b.p });
    return {
      ...p,
      vegasAvgS: avg(v.sS, v.nS),
      vegasAvgT: avg(v.sT, v.nT),
      vegasAvg: avg(v.sS + v.sT, v.nS + v.nT),
      finalAvgS: avg(p.final.sS, p.final.n),
      finalAvgT: avg(p.final.sT, p.final.n),
      finalAvg: avg(p.final.sS + p.final.sT, p.final.n * 2),
      picksLock: combinedPicks(p.atsLock, p.ouLock),
      picksClose: combinedPicks(p.atsClose, p.ouClose),
      pickMarginLock: avg(p.atsLock.byTotal + p.ouLock.byTotal, p.atsLock.byN + p.ouLock.byN),
      pickMarginClose: avg(p.atsClose.byTotal + p.ouClose.byTotal, p.atsClose.byN + p.ouClose.byN),
    };
  });
  return players;
}

// Sort helper: nulls last.
export function rankBy(players, key, dir = 'asc') {
  const val = (p) => (typeof key === 'function' ? key(p) : p[key]);
  return [...players].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return dir === 'asc' ? x - y : y - x;
  });
}

export function groupByGame(rows) {
  const games = new Map();
  for (const raw of rows) {
    const r = analyzeRow(raw);
    if (!games.has(r.game_id)) games.set(r.game_id, { ...r, players: [] });
    games.get(r.game_id).players.push(r);
  }
  return [...games.values()];
}
