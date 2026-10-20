import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../../../lib/supabase';
import { refreshLines, refreshScores } from '../../../lib/odds';

export const dynamic = 'force-dynamic';

// Called by the Supabase scheduler (pg_cron) before kickoffs and after games.
// Body: { "kinds": ["lines", "scores"] }   Header: Authorization: Bearer <CRON_SECRET>
export async function POST(req) {
  const secret = (process.env.CRON_SECRET || '').trim();
  const authz = req.headers.get('authorization') || '';
  if (!secret || authz !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const apiKey = (process.env.ODDS_API_KEY || '').trim();
  if (!apiKey) return Response.json({ ok: false, error: 'ODDS_API_KEY missing' }, { status: 500 });

  let kinds = [];
  try {
    const body = await req.json();
    kinds = Array.isArray(body?.kinds) ? body.kinds : [];
  } catch {}

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const ops = {
    claim: (kind, min) => sb.rpc('cron_claim_fetch', { p_secret: secret, p_kind: kind, p_min_minutes: min }),
    ingestLines: (rows, remaining) =>
      sb.rpc('cron_ingest_lines', { p_secret: secret, p_rows: rows, p_remaining: remaining }),
    ingestScores: (rows) => sb.rpc('cron_ingest_scores', { p_secret: secret, p_rows: rows }),
    record: (kind, ok, message) =>
      sb.rpc('cron_record_result', { p_secret: secret, p_kind: kind, p_ok: ok, p_message: message }),
  };

  const out = { ok: true };
  if (kinds.includes('lines')) out.lines = await refreshLines(apiKey, ops, 5);
  if (kinds.includes('scores')) out.scores = await refreshScores(apiKey, ops, 5);
  return Response.json(out);
}
