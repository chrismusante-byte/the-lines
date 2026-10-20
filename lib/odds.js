import { weekOf, SEASON, roundHalf } from './nfl';

const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';

function median(nums) {
  const a = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  const m = a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  return roundHalf(m);
}

// Turn one Odds API event into a consensus line (median across US books).
export function normalizeEvent(ev) {
  const spreads = [];
  const totals = [];
  let books = 0;
  for (const bm of ev.bookmakers || []) {
    let counted = false;
    for (const mk of bm.markets || []) {
      if (mk.key === 'spreads') {
        const o = (mk.outcomes || []).find((x) => x.name === ev.home_team);
        if (o && typeof o.point === 'number') {
          spreads.push(o.point);
          counted = true;
        }
      }
      if (mk.key === 'totals') {
        const o = (mk.outcomes || []).find((x) => x.name === 'Over');
        if (o && typeof o.point === 'number') {
          totals.push(o.point);
          counted = true;
        }
      }
    }
    if (counted) books += 1;
  }
  return {
    id: ev.id,
    season: SEASON,
    week: weekOf(ev.commence_time),
    home_team: ev.home_team,
    away_team: ev.away_team,
    commence_time: ev.commence_time,
    home_spread: median(spreads),
    total: median(totals),
    books,
  };
}

/*
 * ops = {
 *   claim(kind, minMinutes) -> { data, error }
 *   ingestLines(rows, remaining) -> { data, error }
 *   ingestScores(rows) -> { data, error }
 *   record(kind, ok, message) -> { error }
 * }
 * Returns a short status string; strings starting with "error" are failures.
 */
export async function refreshLines(apiKey, ops, minMinutes) {
  const { data: due, error: claimErr } = await ops.claim('odds', minMinutes);
  if (claimErr) return `error claim: ${claimErr.message}`;
  if (!due) return 'skipped';

  let status;
  try {
    const url = `${ODDS_BASE}/odds?regions=us&markets=spreads,totals&oddsFormat=american&apiKey=${apiKey}`;
    const r = await fetch(url, { cache: 'no-store' });
    const remaining = parseInt(r.headers.get('x-requests-remaining') || '', 10);
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      status = `error ${r.status}: ${body.slice(0, 200)}`;
    } else {
      const events = await r.json();
      const now = Date.now();
      const rows = events
        .filter((e) => new Date(e.commence_time).getTime() > now)
        .map(normalizeEvent)
        .filter((x) => x.week >= 1);
      const { data: n, error } = await ops.ingestLines(rows, Number.isNaN(remaining) ? null : remaining);
      status = error ? `error db: ${error.message}` : `updated ${n} of ${events.length} games`;
    }
  } catch (e) {
    status = `error fetch: ${e.message}`;
  }
  console.log('[odds] lines:', status);
  await ops.record('odds', !status.startsWith('error'), status);
  return status;
}

export async function refreshScores(apiKey, ops, minMinutes) {
  const { data: due, error: claimErr } = await ops.claim('scores', minMinutes);
  if (claimErr) return `error claim: ${claimErr.message}`;
  if (!due) return 'skipped';

  let status;
  try {
    const url = `${ODDS_BASE}/scores?daysFrom=3&apiKey=${apiKey}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      status = `error ${r.status}: ${body.slice(0, 200)}`;
    } else {
      const events = await r.json();
      const rows = events
        .filter((e) => Array.isArray(e.scores))
        .map((e) => {
          const h = e.scores.find((s) => s.name === e.home_team);
          const a = e.scores.find((s) => s.name === e.away_team);
          return {
            id: e.id,
            completed: !!e.completed,
            home_score: h ? parseInt(h.score, 10) : null,
            away_score: a ? parseInt(a.score, 10) : null,
          };
        });
      const { data: n, error } = await ops.ingestScores(rows);
      status = error ? `error db: ${error.message}` : `updated ${n}`;
    }
  } catch (e) {
    status = `error fetch: ${e.message}`;
  }
  console.log('[odds] scores:', status);
  await ops.record('scores', !status.startsWith('error'), status);
  return status;
}
