import {
  toLeaderRows,
  resolveVisibility,
  isOursRow,
  mapRecentGame,
  groupBoardsByCategory,
  type LeaderBoardResult,
} from '../load';
import { getStatDef } from '@baseball/shared';

describe('league-home load helpers', () => {
  it('masks names for public viewers and excludes opted-out players', () => {
    const snap = [
      { player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez', public_opt_out: false, team_name: 'Reds', stats: { avg: 0.35 }, plate_appearances: 30, innings_pitched_outs: 0 },
      { player_id: 'p2', first_name: 'Sam', last_name: 'Lee', public_opt_out: true, team_name: 'Jays', stats: { avg: 0.4 }, plate_appearances: 30, innings_pitched_outs: 0 },
    ];
    const rows = toLeaderRows(snap as any, 'avg', false);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Alex R.');
  });

  it('shows full names to authed members and keeps opted-out players', () => {
    const snap = [
      { player_id: 'p2', first_name: 'Sam', last_name: 'Lee', public_opt_out: true, team_name: 'Jays', stats: { avg: 0.4 }, plate_appearances: 30, innings_pitched_outs: 0 },
    ];
    const rows = toLeaderRows(snap as any, 'avg', true);
    expect(rows[0].name).toBe('Sam Lee');
  });

  it('reads the ip qualifier from innings_pitched_outs for pitching stats', () => {
    const snap = [
      { player_id: 'p3', first_name: 'Pat', last_name: 'Kim', public_opt_out: false, team_name: 'Reds', stats: { era: 2.5 }, plate_appearances: 0, innings_pitched_outs: 21 },
    ];
    const rows = toLeaderRows(snap as any, 'era', true);
    expect(rows[0].qualifierValue).toBe(21);
    expect(rows[0].value).toBe(2.5);
  });

  it('resolveVisibility blocks anon on signed_in leagues', () => {
    expect(resolveVisibility('signed_in', false)).toBe('blocked');
    expect(resolveVisibility('signed_in', true)).toBe('ok');
    expect(resolveVisibility('public', false)).toBe('ok');
  });
});

describe('isOursRow', () => {
  const playerStat = getStatDef('avg'); // subject: 'player'
  const teamStat = getStatDef('teamAvg'); // subject: 'team'

  it('never marks rows when there is no active-team ref (public/unauthed)', () => {
    expect(isOursRow(playerStat, { id: 'p1', teamName: 'Reds' }, null)).toBe(false);
    expect(isOursRow(teamStat, { id: 't1' }, null)).toBe(false);
  });

  it('matches player rows on team name, ignoring case and surrounding whitespace', () => {
    const ref = { id: 't1', name: '  Reds ' };
    expect(isOursRow(playerStat, { id: 'p1', teamName: 'reds' }, ref)).toBe(true);
    expect(isOursRow(playerStat, { id: 'p2', teamName: 'Jays' }, ref)).toBe(false);
    expect(isOursRow(playerStat, { id: 'p3' }, ref)).toBe(false); // no teamName
  });

  it('matches team rows on id, not name', () => {
    const ref = { id: 't1', name: 'Reds' };
    expect(isOursRow(teamStat, { id: 't1' }, ref)).toBe(true);
    expect(isOursRow(teamStat, { id: 't2' }, ref)).toBe(false);
  });
});

describe('mapRecentGame', () => {
  const base = { id: 'g1', opponent_name: 'Jays', neutral_home_team: null };

  it('reads our score from the home side and credits a win when we are home', () => {
    const g = { ...base, home_score: 7, away_score: 3, location_type: 'home' };
    expect(mapRecentGame(g, 'Reds', 't1')).toEqual({
      id: 'g1', team: 'Reds', team_id: 't1', opponent: 'Jays', ourScore: 7, theirScore: 3, result: 'W',
    });
  });

  it('flips to the away side and records a loss when we are away', () => {
    const g = { ...base, home_score: 7, away_score: 3, location_type: 'away' };
    const out = mapRecentGame(g, 'Reds', 't1');
    expect(out.ourScore).toBe(3);
    expect(out.theirScore).toBe(7);
    expect(out.result).toBe('L');
  });

  it('records a tie on equal scores', () => {
    const g = { ...base, home_score: 4, away_score: 4, location_type: 'home' };
    expect(mapRecentGame(g, 'Reds', 't1').result).toBe('T');
  });

  it('mapRecentGame carries the team id through', () => {
    const g = { id: 'g1', opponent_name: 'Foes', home_score: 5, away_score: 2, location_type: 'home', neutral_home_team: null };
    expect(mapRecentGame(g as any, 'Reds', 't1')).toMatchObject({ team_id: 't1', result: 'W' });
  });
});

describe('groupBoardsByCategory', () => {
  const mk = (key: string): LeaderBoardResult => ({
    def: getStatDef(key as any),
    label: getStatDef(key as any).label,
    rows: [],
  });

  it('routes each board into the tab named by its StatDef.group', () => {
    const grouped = groupBoardsByCategory([mk('avg'), mk('era'), mk('teamAvg'), mk('qabPct'), mk('doubles')]);
    expect(grouped.batting.map((b) => b.def.key)).toEqual(['avg']);
    expect(grouped.pitching.map((b) => b.def.key)).toEqual(['era']);
    expect(grouped.team.map((b) => b.def.key)).toEqual(['teamAvg']);
    // qabPct + doubles are both group 'special'
    expect(grouped.special.map((b) => b.def.key)).toEqual(['qabPct', 'doubles']);
  });

  it('preserves input order within a group', () => {
    const grouped = groupBoardsByCategory([mk('ops'), mk('avg'), mk('obp')]);
    expect(grouped.batting.map((b) => b.def.key)).toEqual(['ops', 'avg', 'obp']);
  });
});
