// NFL team reference data: abbreviation, conference/division, primary color.
// Keys match The Odds API team names exactly.
export const TEAMS = {
  'Arizona Cardinals': { abbr: 'ARI', div: 'NFC West', color: '#97233F' },
  'Atlanta Falcons': { abbr: 'ATL', div: 'NFC South', color: '#A71930' },
  'Baltimore Ravens': { abbr: 'BAL', div: 'AFC North', color: '#241773' },
  'Buffalo Bills': { abbr: 'BUF', div: 'AFC East', color: '#00338D' },
  'Carolina Panthers': { abbr: 'CAR', div: 'NFC South', color: '#0085CA' },
  'Chicago Bears': { abbr: 'CHI', div: 'NFC North', color: '#C83803' },
  'Cincinnati Bengals': { abbr: 'CIN', div: 'AFC North', color: '#FB4F14' },
  'Cleveland Browns': { abbr: 'CLE', div: 'AFC North', color: '#FF3C00' },
  'Dallas Cowboys': { abbr: 'DAL', div: 'NFC East', color: '#003594' },
  'Denver Broncos': { abbr: 'DEN', div: 'AFC West', color: '#FB4F14' },
  'Detroit Lions': { abbr: 'DET', div: 'NFC North', color: '#0076B6' },
  'Green Bay Packers': { abbr: 'GB', div: 'NFC North', color: '#203731' },
  'Houston Texans': { abbr: 'HOU', div: 'AFC South', color: '#A71930' },
  'Indianapolis Colts': { abbr: 'IND', div: 'AFC South', color: '#002C5F' },
  'Jacksonville Jaguars': { abbr: 'JAX', div: 'AFC South', color: '#006778' },
  'Kansas City Chiefs': { abbr: 'KC', div: 'AFC West', color: '#E31837' },
  'Las Vegas Raiders': { abbr: 'LV', div: 'AFC West', color: '#A5ACAF' },
  'Los Angeles Chargers': { abbr: 'LAC', div: 'AFC West', color: '#0080C6' },
  'Los Angeles Rams': { abbr: 'LAR', div: 'NFC West', color: '#003594' },
  'Miami Dolphins': { abbr: 'MIA', div: 'AFC East', color: '#008E97' },
  'Minnesota Vikings': { abbr: 'MIN', div: 'NFC North', color: '#4F2683' },
  'New England Patriots': { abbr: 'NE', div: 'AFC East', color: '#C60C30' },
  'New Orleans Saints': { abbr: 'NO', div: 'NFC South', color: '#D3BC8D' },
  'New York Giants': { abbr: 'NYG', div: 'NFC East', color: '#0B2265' },
  'New York Jets': { abbr: 'NYJ', div: 'AFC East', color: '#125740' },
  'Philadelphia Eagles': { abbr: 'PHI', div: 'NFC East', color: '#004C54' },
  'Pittsburgh Steelers': { abbr: 'PIT', div: 'AFC North', color: '#FFB612' },
  'San Francisco 49ers': { abbr: 'SF', div: 'NFC West', color: '#AA0000' },
  'Seattle Seahawks': { abbr: 'SEA', div: 'NFC West', color: '#69BE28' },
  'Tampa Bay Buccaneers': { abbr: 'TB', div: 'NFC South', color: '#D50A0A' },
  'Tennessee Titans': { abbr: 'TEN', div: 'AFC South', color: '#4B92DB' },
  'Washington Commanders': { abbr: 'WAS', div: 'NFC East', color: '#773141' },
};

export function team(name) {
  return (
    TEAMS[name] || {
      abbr: (name || '???').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase(),
      div: null,
      color: '#666',
    }
  );
}

export function isDivisional(home, away) {
  const h = team(home).div;
  const a = team(away).div;
  return !!h && h === a;
}

export function isConference(home, away) {
  const h = team(home).div;
  const a = team(away).div;
  return !!h && !!a && h.slice(0, 3) === a.slice(0, 3);
}

// Nickname only ("Chicago Bears" -> "Bears"), used for compact display.
export function nickname(name) {
  if (!name) return '';
  const parts = name.split(' ');
  return parts[parts.length - 1];
}
