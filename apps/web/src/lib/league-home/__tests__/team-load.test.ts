import {
  teamHref,
  computeTeamRank,
  toTeamPlayerRows,
  teamIdByName,
  buildTeamStatList,
} from '../team-load';

describe('teamHref', () => {
  it('builds a season-scoped team URL', () => {
    expect(teamHref('acme', 't1', '2026')).toBe('/l/acme/team/t1?season=2026');
  });
  it('omits the season param when no season is given', () => {
    expect(teamHref('acme', 't1')).toBe('/l/acme/team/t1');
  });
  it('encodes season values with spaces', () => {
    expect(teamHref('acme', 't1', 'Spring 2026')).toBe('/l/acme/team/t1?season=Spring%202026');
  });
});

describe('computeTeamRank', () => {
  const standings = [
    { team_id: 't1', win_pct: 0.6 },
    { team_id: 't2', win_pct: 0.8 },
    { team_id: 't3', win_pct: 0.4 },
    { team_id: null, win_pct: 0.9 }, // external opponent row — excluded
  ];
  it('ranks a team among platform teams by win_pct (1-based)', () => {
    expect(computeTeamRank(standings as any, 't2')).toEqual({ rank: 1, total: 3 });
    expect(computeTeamRank(standings as any, 't1')).toEqual({ rank: 2, total: 3 });
    expect(computeTeamRank(standings as any, 't3')).toEqual({ rank: 3, total: 3 });
  });
  it('returns null rank when the team is absent', () => {
    expect(computeTeamRank(standings as any, 'tX')).toEqual({ rank: null, total: 3 });
  });
});

describe('toTeamPlayerRows', () => {
  const snap = [
    { player_id: 'p1', first_name: 'Alex', last_name: 'Ramirez', public_opt_out: false, stats: { avg: 0.35 }, plate_appearances: 30, innings_pitched_outs: 0 },
    { player_id: 'p2', first_name: 'Sam', last_name: 'Lee', public_opt_out: true, stats: { avg: 0.4 }, plate_appearances: 25, innings_pitched_outs: 0 },
  ];
  it('masks names and flags opt-out for public viewers', () => {
    const rows = toTeamPlayerRows(snap as any, false);
    expect(rows.find((r) => r.playerId === 'p1')).toMatchObject({ name: 'Alex R.', optedOut: false });
    expect(rows.find((r) => r.playerId === 'p2')).toMatchObject({ name: 'Sam L.', optedOut: true });
  });
  it('shows full names and never flags opt-out for authed viewers', () => {
    const rows = toTeamPlayerRows(snap as any, true);
    expect(rows.find((r) => r.playerId === 'p2')).toMatchObject({ name: 'Sam Lee', optedOut: false });
  });
});

describe('teamIdByName', () => {
  it('maps folded team names to ids, skipping null-id rows', () => {
    const map = teamIdByName([
      { team_id: 't1', team_name: '  Reds ' },
      { team_id: null, team_name: 'Outsiders' },
    ] as any);
    expect(map.get('reds')).toBe('t1');
    expect(map.has('outsiders')).toBe(false);
  });
});

describe('buildTeamStatList', () => {
  it('produces formatted team-group stats in catalog order', () => {
    const list = buildTeamStatList({ teamAvg: 0.301, teamEra: 3.5, runsScored: 88, runDiff: 12 });
    expect(list.map((s) => s.label)).toEqual(['Team AVG', 'Team ERA', 'Runs Scored', 'Run Diff']);
    expect(list[0].display).toBe('.301');
    expect(list[1].display).toBe('3.50');
    expect(list[2].display).toBe('88');
    expect(list[3].display).toBe('12');
  });
});
