import { getUserClient } from '../../../lib/supabase';
import { weekOf, SEASON, roundHalf } from '../../../lib/nfl';

export const dynamic = 'force-dynamic';

const ODDS_BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl';

function median(nums) {
  const a = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((x, y) => x - y);
  if (a.length === 0) return null;
  const mid = Math.floor(a.length / 2);
  const m = a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  return roundHalf(m);
}

// Turn one Odds API event into a consensus line (median across US books).
function normalizeEvent(ev) {
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

export async function POST(req) {
  const authz = req.headers.get('authorization');
  if (!authz) return Response.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: 'ODDS_API_KEY is not set on the server yet.' });
  }

  let force = false;
  try {
    const body = await req.json();
    force = !!body?.force;
  } catch {}

  const sb = getUserClient(authz);
  const out = { ok: true, lines: 'skipped', scores: 'skipped' };

  // ---- Lines (spreads + totals): costs 2 API credits per call ----
  const { data: dueLines, error: claimErr } = await sb.rpc('claim_fetch', {
    p_kind: 'odds',
    p_min_minutes: force ? 3 : 15,
  });
  if (claimErr) return Response.json({ ok: false, error: claimErr.message }, { status: 403 });

  if (dueLines) {
    try {
      const url = `${ODDS_BASE}/odds?regions=us&markets=spreads,totals&oddsFormat=american&apiKey=${apiKey}`;
      const r = await fetch(url, { cache: 'no-store' });
      const remaining = parseInt(r.headers.get('x-requests-remaining') || '', 10);
      if (!r.ok) {
        out.lines = `error ${r.status}`;
      } else {
        const events = await r.json();
        const now = Date.now();
        const rows = events
          .filter((e) => new Date(e.commence_time).getTime() > now)
          .map(normalizeEvent)
          .filter((x) => x.week >= 1);
        const { data: n, error } = await sb.rpc('ingest_lines', {
          p_rows: rows,
          p_remaining: Number.isNaN(remaining) ? null : remaining,
        });
        out.lines = error ? `db error: ${error.message}` : `updated ${n}`;
        out.remaining = Number.isNaN(remaining) ? null : remaining;
      }
    } catch (e) {
      out.lines = `fetch failed: ${e.message}`;
    }
  }

  // ---- Scores for games that kicked off in the last 3 days ----
  const { data: need } = await sb.rpc('games_needing_scores');
  if (need > 0) {
    const { data: dueScores } = await sb.rpc('claim_fetch', {
      p_kind: 'scores',
      p_min_minutes: force ? 5 : 20,
    });
    if (dueScores) {
      try {
        const url = `${ODDS_BASE}/scores?daysFrom=3&apiKey=${apiKey}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) {
          out.scores = `error ${r.status}`;
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
          const { data: n, error } = await sb.rpc('ingest_scores', { p_rows: rows });
          out.scores = error ? `db error: ${error.message}` : `updated ${n}`;
        }
      } catch (e) {
        out.scores = `fetch failed: ${e.message}`;
      }
    }
  }

  return Response.json(out);
}
