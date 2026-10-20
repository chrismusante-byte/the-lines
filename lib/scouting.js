import { SEASON } from './nfl';
import { team } from './teams';

const DAY = 24 * 3600 * 1000;

export function findEspnGame(ctx, game) {
  if (!ctx) return null;
  const t = new Date(game.commence_time).getTime();
  return (
    ctx.results.find(
      (r) =>
        r.home_team === game.home_team &&
        r.away_team === game.away_team &&
        Math.abs(new Date(r.game_date).getTime() - t) < 1.5 * DAY
    ) || null
  );
}

export function teamForm(ctx, teamName, beforeIso) {
  const before = new Date(beforeIso).getTime() - 6 * 3600 * 1000;
  const games = ctx.results
    .filter(
      (r) =>
        r.season === SEASON &&
        r.season_type === 2 &&
        r.completed &&
        (r.home_team === teamName || r.away_team === teamName) &&
        new Date(r.game_date).getTime() < before
    )
    .sort((a, b) => new Date(a.game_date) - new Date(b.game_date));

  const rec = { w: 0, l: 0, t: 0 };
  const home = { w: 0, l: 0, t: 0 };
  const road = { w: 0, l: 0, t: 0 };
  let pf = 0;
  let pa = 0;
  const log = games.map((r) => {
    const isHome = r.home_team === teamName;
    const us = isHome ? r.home_score : r.away_score;
    const them = isHome ? r.away_score : r.home_score;
    const res = us > them ? 'W' : us < them ? 'L' : 'T';
    const key = res === 'W' ? 'w' : res === 'L' ? 'l' : 't';
    rec[key]++;
    (isHome ? home : road)[key]++;
    pf += us;
    pa += them;
    return {
      res,
      us,
      them,
      at: isHome ? 'vs' : '@',
      opp: team(isHome ? r.away_team : r.home_team).abbr,
      week: r.week,
    };
  });

  let streak = null;
  if (log.length) {
    const last = log[log.length - 1].res;
    let n = 0;
    for (let i = log.length - 1; i >= 0 && log[i].res === last; i--) n++;
    streak = `${last}${n}`;
  }

  const n = games.length;
  return {
    n,
    rec,
    home,
    road,
    streak,
    last3: log.slice(-3).reverse(),
    pf: n ? pf / n : null,
    pa: n ? pa / n : null,
  };
}

export function lastMeeting(ctx, a, b, beforeIso) {
  const before = new Date(beforeIso).getTime() - 6 * 3600 * 1000;
  const meets = ctx.results
    .filter(
      (r) =>
        r.completed &&
        new Date(r.game_date).getTime() < before &&
        ((r.home_team === a && r.away_team === b) || (r.home_team === b && r.away_team === a))
    )
    .sort((x, y) => new Date(y.game_date) - new Date(x.game_date));
  return meets[0] || null;
}

export function recStr(r) {
  return `${r.w}-${r.l}${r.t ? `-${r.t}` : ''}`;
}
