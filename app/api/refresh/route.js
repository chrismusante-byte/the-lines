import { getUserClient } from '../../../lib/supabase';
import { refreshLines, refreshScores } from '../../../lib/odds';

export const dynamic = 'force-dynamic';

// Called by the app when a signed-in player opens a week or taps Refresh.
export async function POST(req) {
  const authz = req.headers.get('authorization');
  if (!authz) return Response.json({ ok: false, error: 'Not signed in' }, { status: 401 });

  const apiKey = (process.env.ODDS_API_KEY || '').trim();
  if (!apiKey) {
    return Response.json({ ok: false, error: 'ODDS_API_KEY is not set on the server yet.' });
  }

  let force = false;
  try {
    const body = await req.json();
    force = !!body?.force;
  } catch {}

  const sb = getUserClient(authz);
  const ops = {
    claim: (kind, min) => sb.rpc('claim_fetch', { p_kind: kind, p_min_minutes: min }),
    ingestLines: (rows, remaining) => sb.rpc('ingest_lines', { p_rows: rows, p_remaining: remaining }),
    ingestScores: (rows) => sb.rpc('ingest_scores', { p_rows: rows }),
    record: (kind, ok, message) => sb.rpc('record_fetch_result', { p_kind: kind, p_ok: ok, p_message: message }),
  };

  // Confirm this user is a player before spending any API credits.
  const { data: me, error: meErr } = await sb.rpc('whoami');
  if (meErr || !me) return Response.json({ ok: false, error: 'Not on the roster' }, { status: 403 });

  const out = { ok: true };
  out.lines = await refreshLines(apiKey, ops, force ? 3 : 15);

  const { data: need } = await sb.rpc('games_needing_scores');
  out.scores = need > 0 ? await refreshScores(apiKey, ops, force ? 5 : 20) : 'skipped';

  return Response.json(out);
}
