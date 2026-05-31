import { toLeaderRows, resolveVisibility } from '../load';

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
