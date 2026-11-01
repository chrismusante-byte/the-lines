// Weekly bot lock: fetch the slate (teams + kickoff only), build scouting matchups, ask each bot, save.
import { BOTS, buildMatchup, runBot } from './bots';

// Only these keys may reach the model. Any other key (e.g. a betting line) blocks the call.
// Checks key NAMES, not values, so team names like "Las Vegas Raiders" are fine.
const ALLOWED_KEYS = new Set([
  'game_id', 'kickoff', 'away', 'home', 'team', 'record', 'home_record', 'road_record', 'streak',
  'avg_points_scored', 'avg_points_allowed', 'last3', 'injuries', 'divisional', 'neutral_site',
  'weather', 'last_meeting',
]);
function badKeys(v, found = []) {
  if (Array.isArray(v)) v.forEach((x) => badKeys(x, found));
  else if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (!ALLOWED_KEYS.has(k)) found.push(k);
      badKeys(v[k], found);
    }
  }
  return found;
}

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
      const bad = badKeys(matchups);
      if (bad.length) {
        parts.push(`error ${b.name}: unexpected field "${bad[0]}" in prompt, not sent`);
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
