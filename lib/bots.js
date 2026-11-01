// AI bot players: AI Sharp and AI Square.
// They guess every spread and total from the scouting report ONLY.
// No betting line, open line, or odds field is ever put in the prompt (enforced by buildMatchup's whitelist).
import { team, isDivisional } from './teams';
import { findEspnGame, teamForm, lastMeeting, recStr } from './scouting';

export const BOT_MODEL = 'claude-sonnet-5-5';

export const BOTS = {
  sharp: {
    name: 'AI Sharp',
    style: `You are "AI Sharp", a disciplined professional NFL handicapper building your own lines.
Principles:
- Start from team strength: points scored/allowed per game, record, and home/road form. Home field is worth about 1.5 points.
- Respect key numbers. Spreads land on 3 and 7 most often, then 6, 10, 4, 14. Prefer those when your number is close.
- Injuries: a starting QB out moves a spread 3 to 7 points; skill-position players move it 0.5 to 1.5. Ignore "Questionable" unless several stack up.
- Weather only matters outdoors: wind over 15 mph or heavy rain lowers totals 2 to 5 points. Domes are neutral.
- Fade recency: don't overreact to streaks or one blowout. Regress extreme results toward average.
- Divisional games tend to be closer and lower scoring than the raw numbers suggest.`,
  },
  square: {
    name: 'AI Square',
    style: `You are "AI Square", a casual public bettor making lines from gut feel.
Habits:
- You love favorites and home teams, and give them a few extra points.
- You chase hot teams: winning streaks and recent blowouts weigh heavily. Losing streaks mean a team is "bad."
- You like big offenses and overs. Totals lean high, especially for teams that scored a lot lately.
- You mostly ignore weather and only notice a superstar QB being out.
- You don't think about key numbers.`,
  },
};

const r1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);

// Whitelisted scouting facts for one game. Only these fields reach the model.
export function buildMatchup(ctx, game) {
  const eg = findEspnGame(ctx, game);
  const side = (name, isHome) => {
    const f = teamForm(ctx, name, game.commence_time);
    const inj = (ctx.injuries?.[name]?.items || [])
      .filter((p) => p.status !== 'Injured Reserve')
      .slice(0, 8)
      .map((p) => `${p.pos} ${p.name} (${p.status})`);
    return {
      team: name,
      record: recStr(f.rec),
      [isHome ? 'home_record' : 'road_record']: recStr(isHome ? f.home : f.road),
      streak: f.streak,
      avg_points_scored: r1(f.pf),
      avg_points_allowed: r1(f.pa),
      last3: f.last3.map((g) => `${g.res} ${g.us}-${g.them} ${g.at} ${g.opp}`),
      injuries: inj,
    };
  };
  const lm = lastMeeting(ctx, game.home_team, game.away_team, game.commence_time);
  let weather = 'unknown';
  if (eg?.indoor) weather = 'indoors';
  else if (eg?.forecast) {
    const fc = eg.forecast;
    weather = `outdoors, ${fc.temp != null ? Math.round(fc.temp) + 'F' : '?'}, wind ${fc.wind != null ? Math.round(fc.wind) : '?'} mph, rain ${fc.precip ?? '?'}%`;
  } else if (eg) weather = 'outdoors, forecast not out yet';
  return {
    game_id: game.id,
    kickoff: game.commence_time,
    away: side(game.away_team, false),
    home: side(game.home_team, true),
    divisional: isDivisional(game.home_team, game.away_team),
    neutral_site: !!eg?.neutral,
    weather,
    last_meeting: lm
      ? `${team(lm.away_team).abbr} ${lm.away_score} @ ${team(lm.home_team).abbr} ${lm.home_score} (${lm.game_date.slice(0, 10)})`
      : 'none since 2024',
  };
}

const TOOL = {
  name: 'submit_lines',
  description: 'Submit your spread and total for every game.',
  input_schema: {
    type: 'object',
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            game_id: { type: 'string' },
            home_spread: {
              type: 'number',
              description: 'Home team spread in half points. Negative = home favored (e.g. -3.5). 0 = pick em.',
            },
            total: { type: 'number', description: 'Total points in half points, e.g. 44.5' },
            reason: { type: 'string', description: 'One short sentence, under 20 words, in your voice.' },
          },
          required: ['game_id', 'home_spread', 'total', 'reason'],
        },
      },
    },
    required: ['lines'],
  },
};

const half = (n) => Math.round(Number(n) * 2) / 2;

// Calls Claude once for one bot and returns [{game_id, home_spread, total, reason}].
export async function runBot(apiKey, botKey, matchups) {
  const bot = BOTS[botKey];
  const body = {
    model: BOT_MODEL,
    max_tokens: 4000,
    system: `${bot.style}

You will get a scouting report for each NFL game this week. You have NOT seen any sportsbook lines and must not try to recall them. Set your own number for each game: the home team's point spread and the total. Use half-point steps. Call submit_lines once with every game.`,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{ role: 'user', content: `Games this week:\n${JSON.stringify(matchups, null, 1)}` }],
  };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`claude ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  const j = await r.json();
  const use = (j.content || []).find((c) => c.type === 'tool_use');
  const ids = new Set(matchups.map((m) => m.game_id));
  return (use?.input?.lines || [])
    .filter((l) => ids.has(l.game_id) && Number.isFinite(Number(l.home_spread)) && Number.isFinite(Number(l.total)))
    .map((l) => ({
      game_id: l.game_id,
      home_spread: Math.max(-40, Math.min(40, half(l.home_spread))),
      total: Math.max(10, Math.min(99, half(l.total))),
      reason: String(l.reason || '').slice(0, 200),
    }));
}
