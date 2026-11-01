// Weekly bot lock: fetch the slate (teams + kickoff only), build scouting matchups, ask each bot, save.
import { BOTS, buildMatchup, runBot } from './bots';

// Fields that must never reach the model. Checked before every call.
const FORBIDDEN = /spread|total"|odds|vegas|line_|books|moneyline/i;

export async function runBotsJob(sb, secret, apiKey, { dry = false } = {}) {
  if (!apiKey) return 'error bots: ANTHROPIC_API_KEY is not set';
  const { data: slate, error } = await sb.rpc('cron_bot_slate', { p_secret: secret });
  if (error) return `error bots slate: ${error.message}`;

  const ctx = { results: slate.results || [], injuries: slate.injuries || {} };
  const bots = dry
    ? Object.keys(BOTS).map((k) => ({ id: `dry-${k}`, bot_key: k, name: BOTS[k].name }))
    : (slate.bots || []).filter((b) => BOTS[b.bot_key]);
  if (!bots.length) return 'error bots: no bot players set up';

  const games = slate.games || [];
  const out = { status: '', dry, picks: {} };
  const parts = [];
  const rows = [];

  await Promise.all(
    bots.map(async (b) => {
      const todo = games.filter((g) => dry || (g.missing || []).includes(b.bot_key));
      if (!todo.length) {
        parts.push(`${b.name} 0 games`);
        return;
      }
      const matchups = todo.map((g) => buildMatchup(ctx, g));
      const prompt = JSON.stringify(matchups);
      if (FORBIDDEN.test(prompt)) {
        parts.push(`error ${b.name}: odds field found in prompt, not sent`);
        return;
      }
      try {
        const lines = await runBot(apiKey, b.bot_key, matchups);
        out.picks[b.name] = lines;
        for (const l of lines) rows.push({ player_id: b.id, ...l });
        parts.push(`${b.name} ${lines.length}/${todo.length}`);
      } catch (e) {
        parts.push(`error ${b.name}: ${e.message}`);
      }
    })
  );

  if (!dry && rows.length) {
    const { data: n, error: lockErr } = await sb.rpc('cron_lock_bot_guesses', { p_secret: secret, p_rows: rows });
    parts.push(lockErr ? `error lock: ${lockErr.message}` : `saved ${n}`);
  }
  const failed = parts.some((p) => p.startsWith('error'));
  out.status = `${failed ? 'error ' : ''}${parts.join(' · ')}`;
  return out;
}
