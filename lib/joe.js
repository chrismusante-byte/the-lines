// Grading for Joe Fortenbaugh's published picks.
// side = the side Joe is effectively on (bad bets are stored as the fade side).
// line = the number Joe used (home spread for spread picks, total for totals).
import { team } from './teams';
import { fmtNum, atsLean, ouLean } from './nfl';
import { analyzeRow } from './stats';

export function gradeJoe(p) {
  if (!p.completed || p.home_score == null || p.away_score == null) return null;
  const margin = p.home_score - p.away_score;
  const total = p.home_score + p.away_score;
  const line = Number(p.line);
  let v;
  if (p.pick_type === 'spread') v = p.side === 'home' ? margin + line : -(margin + line);
  else v = p.side === 'over' ? total - line : line - total;
  return { res: v > 0 ? 'W' : v < 0 ? 'L' : 'P', by: v };
}

// "BUF −3", "MIA +3.5", "Over 44.5"
export function joeLabel(p) {
  const line = Number(p.line);
  if (p.pick_type === 'total') return `${p.side === 'over' ? 'Over' : 'Under'} ${fmtNum(line)}`;
  const abbr = team(p.side === 'home' ? p.home_team : p.away_team).abbr;
  const n = p.side === 'home' ? line : -line;
  if (n === 0) return `${abbr} PK`;
  return `${abbr} ${n < 0 ? '−' : '+'}${fmtNum(Math.abs(n))}`;
}

function emptyRec() {
  return { w: 0, l: 0, p: 0 };
}
function add(rec, g) {
  if (!g) return;
  if (g.res === 'W') rec.w++;
  else if (g.res === 'L') rec.l++;
  else rec.p++;
}

// Players' own leans (their guess vs the line they locked) on the same bets Joe made.
export function vsJoe(picks, rows) {
  const joe = { all: emptyRec(), byCat: {} };
  const players = new Map();
  const byGame = new Map();
  for (const raw of rows || []) {
    const r = analyzeRow(raw);
    if (!byGame.has(r.game_id)) byGame.set(r.game_id, []);
    byGame.get(r.game_id).push(r);
  }
  const list = picks.map((p) => {
    const g = gradeJoe(p);
    add(joe.all, g);
    if (!joe.byCat[p.category]) joe.byCat[p.category] = emptyRec();
    add(joe.byCat[p.category], g);

    const others = (byGame.get(p.game_id) || []).map((r) => {
      const lean = p.pick_type === 'spread' ? atsLean(r.g, r.lock) : ouLean(r.gt, r.lockT);
      const grade = p.pick_type === 'spread' ? r.atsLock : r.ouLock;
      const agrees = lean && lean !== 'none' ? lean === p.side : null;
      if (!players.has(r.player_id)) {
        players.set(r.player_id, { player_id: r.player_id, name: r.name, is_bot: r.is_bot, rec: emptyRec(), agree: 0, n: 0 });
      }
      const pl = players.get(r.player_id);
      if (g) add(pl.rec, grade);
      pl.n++;
      if (agrees) pl.agree++;
      return { name: r.name, is_bot: r.is_bot, agrees, grade };
    });
    return { ...p, grade: g, others };
  });
  return { joe, players: [...players.values()], list };
}
