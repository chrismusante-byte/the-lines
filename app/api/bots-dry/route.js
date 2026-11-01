import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../../../lib/supabase';
import { runBotsJob } from '../../../lib/botjob';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Test-only: runs both bots on the upcoming slate and returns their numbers WITHOUT saving.
// Works only on Vercel preview deployments (which are behind Vercel login). Disabled in production.
export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return Response.json({ ok: false, error: 'not available' }, { status: 404 });
  }
  const secret = (process.env.CRON_SECRET || '').trim();
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const out = await runBotsJob(sb, secret, (process.env.ANTHROPIC_API_KEY || '').trim(), { dry: true });
  return Response.json(out);
}
