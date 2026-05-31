import { computeStandings, type GameRow } from '../standings';

const games: GameRow[] = [
  { team_id: 't1', home_score: 5, away_score: 3, location_type: 'home', neutral_home_team: null, status: 'completed' },
  { team_id: 't1', home_score: 2, away_score: 4, location_type: 'away', neutral_home_team: null, status: 'completed' },
  { team_id: 't2', home_score: 1, away_score: 1, location_type: 'home', neutral_home_team: null, status: 'completed' },
];

describe('computeStandings', () => {
  it('tallies W/L/T and run differential from each team perspective', () => {
    const out = computeStandings(games);
    expect(out.get('t1')).toMatchObject({ wins: 2, losses: 0, ties: 0, runsFor: 9, runsAgainst: 5 });
    expect(out.get('t2')).toMatchObject({ wins: 0, losses: 0, ties: 1 });
  });

  it('computes win_pct as W/(W+L+T)', () => {
    const out = computeStandings(games);
    expect(out.get('t1')!.winPct).toBeCloseTo(1.0);
  });

  it('ignores non-completed games', () => {
    const out = computeStandings([
      { team_id: 't3', home_score: 9, away_score: 0, location_type: 'home', neutral_home_team: null, status: 'scheduled' },
    ]);
    expect(out.has('t3')).toBe(false);
  });
});
