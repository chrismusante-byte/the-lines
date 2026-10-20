// Matchup context: ESPN scoreboards (results, venue, weather), ESPN injuries, Open-Meteo forecast.
// None of these cost Odds API credits. ESPN's public site API is unofficial and can change.
import { SEASON, currentWeek } from './nfl';
import { team } from './teams';
import { STADIUM_COORDS } from './stadiums';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const KEY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

function parseEvent(ev, season, seasonType, week) {
  const comp = ev.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors?.find((c) => c.homeAway === 'home');
  const away = comp.competitors?.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;
  const completed = !!comp.status?.type?.completed || !!ev.status?.type?.completed;
  const w = ev.weather;
  return {
    espn_id: String(ev.id),
    season,
    season_type: seasonType,
    week: ev.week?.number ?? week,
    game_date: ev.date,
    home_team: home.team?.displayName,
    away_team: away.team?.displayName,
    home_score: completed ? parseInt(home.score, 10) : null,
    away_score: completed ? parseInt(away.score, 10) : null,
    completed,
    venue: comp.venue?.fullName || null,
    venue_city: [comp.venue?.address?.city, comp.venue?.address?.state || comp.venue?.address?.country]
      .filter(Boolean)
      .join(', ') || null,
    indoor: comp.venue?.indoor ?? null,
    neutral: !!comp.neutralSite,
    espn_weather: w ? { temp: w.temperature ?? w.highTemperature ?? null, text: w.displayValue || null } : null,
  };
}

async function scoreboard(season, seasonType, week) {
  const data = await getJson(`${ESPN}/scoreboard?seasontype=${seasonType}&week=${week}&dates=${season}`);
  return (data.events || []).map((ev) => parseEvent(ev, season, seasonType, week)).filter(Boolean);
}

// Run many fetches with a small concurrency limit; failures are collected, not thrown.
async function pool(tasks, limit = 6) {
  const results = [];
  const errors = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const t = tasks[i++];
      try {
        results.push(...(await t()));
      } catch (e) {
        errors.push(e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return { results, errors };
}

export async function fetchCurrentSeasonResults() {
  const last = Math.min(18, currentWeek() + 1);
  const tasks = [];
  for (let w = 1; w <= last; w++) tasks.push(() => scoreboard(SEASON, 2, w));
  return pool(tasks);
}

export async function fetchHistory(seasons) {
  const tasks = [];
  for (const s of seasons) {
    for (let w = 1; w <= 18; w++) tasks.push(() => scoreboard(s, 2, w));
    for (let w = 1; w <= 5; w++) tasks.push(() => scoreboard(s, 3, w));
  }
  return pool(tasks);
}

const STATUS_ORDER = { Out: 0, Doubtful: 1, Questionable: 2 };

export async function fetchInjuries() {
  const data = await getJson(`${ESPN}/injuries`);
  return (data.injuries || []).map((t) => ({
    team: t.displayName,
    items: (t.injuries || [])
      .filter((i) => KEY_POSITIONS.has(i.athlete?.position?.abbreviation))
      .map((i) => ({
        name: i.athlete?.displayName,
        pos: i.athlete?.position?.abbreviation,
        status: i.status,
        detail: i.details?.type || null,
        date: i.date || null,
      }))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)),
  }));
}

// Kickoff-hour forecast for outdoor games (Open-Meteo, free, no key).
export async function fetchForecasts(games) {
  const out = [];
  for (const g of games) {
    const coords = STADIUM_COORDS[team(g.home_team).abbr];
    if (!coords) continue;
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}` +
        `&hourly=temperature_2m,precipitation_probability,wind_speed_10m` +
        `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=UTC&forecast_days=8`;
      const d = await getJson(url);
      const times = d.hourly?.time || [];
      const target = new Date(g.game_date).getTime();
      let best = -1;
      let bestDiff = Infinity;
      times.forEach((t, idx) => {
        const diff = Math.abs(new Date(`${t}Z`).getTime() - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = idx;
        }
      });
      if (best >= 0 && bestDiff <= 2 * 3600 * 1000) {
        out.push({
          espn_id: g.espn_id,
          forecast: {
            temp: d.hourly.temperature_2m?.[best] ?? null,
            precip: d.hourly.precipitation_probability?.[best] ?? null,
            wind: d.hourly.wind_speed_10m?.[best] ?? null,
            at: times[best],
            fetched_at: new Date().toISOString(),
          },
        });
      }
    } catch {
      // skip this game; try again next run
    }
  }
  return out;
}

// Full context refresh used by the scheduler. ops wraps the secret-gated RPCs.
export async function refreshContext(ops, { history = false } = {}) {
  const parts = [];

  const cur = await fetchCurrentSeasonResults();
  let rows = cur.results;
  if (history) {
    const h = await fetchHistory([SEASON - 2, SEASON - 1]);
    rows = rows.concat(h.results);
    if (h.errors.length) parts.push(`history errors ${h.errors.length}`);
  }
  if (rows.length) {
    const { data, error } = await ops.upsertResults(rows);
    parts.push(error ? `error results db: ${error.message}` : `results ${data}`);
  }
  if (cur.errors.length) parts.push(`scoreboard errors ${cur.errors.length}`);

  try {
    const inj = await fetchInjuries();
    const { data, error } = await ops.setInjuries(inj);
    parts.push(error ? `error injuries db: ${error.message}` : `injuries ${data} teams`);
  } catch (e) {
    parts.push(`error injuries: ${e.message}`);
  }

  try {
    const { data: upcoming } = await ops.upcomingOutdoor();
    const fc = await fetchForecasts(upcoming || []);
    if (fc.length) {
      const { data, error } = await ops.setForecasts(fc);
      parts.push(error ? `error forecast db: ${error.message}` : `forecasts ${data}`);
    } else parts.push('forecasts 0');
  } catch (e) {
    parts.push(`error forecast: ${e.message}`);
  }

  return parts.join(' · ');
}
