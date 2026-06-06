import { computeStandings, computeOpponentStandings, type GameRow } from '../standings';

const games: GameRow[] = [
  { team_id: 't1', opponent_team_id: null, home_score: 5, away_score: 3, location_type: 'home', neutral_home_team: null, status: 'completed' },
  { team_id: 't1', opponent_team_id: null, home_score: 2, away_score: 4, location_type: 'away', neutral_home_team: null, status: 'completed' },
  { team_id: 't2', opponent_team_id: null, home_score: 1, away_score: 1, location_type: 'home', neutral_home_team: null, status: 'completed' },
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
      { team_id: 't3', opponent_team_id: null, home_score: 9, away_score: 0, location_type: 'home', neutral_home_team: null, status: 'scheduled' },
    ]);
    expect(out.has('t3')).toBe(false);
  });

  it('ignores opponent_team_id (platform-team path only)', () => {
    const out = computeStandings([
      { team_id: 't1', opponent_team_id: 'o1', home_score: 5, away_score: 3, location_type: 'home', neutral_home_team: null, status: 'completed' },
    ]);
    expect(out.get('t1')).toMatchObject({ wins: 1, losses: 0, runsFor: 5, runsAgainst: 3 });
    expect(out.has('o1')).toBe(false);
  });

  it("scores a neutral game as home when neutral_home_team is the 'us' sentinel", () => {
    // recorder is the designated home team -> our score = home_score (4), lost to 13
    const out = computeStandings([
      { team_id: 't1', opponent_team_id: 'o1', home_score: 4, away_score: 13, location_type: 'neutral', neutral_home_team: 'us', status: 'completed' },
    ]);
    expect(out.get('t1')).toMatchObject({ wins: 0, losses: 1, ties: 0, runsFor: 4, runsAgainst: 13 });
  });

  it("scores a neutral game as away when neutral_home_team is the 'opponent' sentinel", () => {
    // recorder is the road team -> our score = away_score (1), lost to 10
    const out = computeStandings([
      { team_id: 't1', opponent_team_id: 'o1', home_score: 10, away_score: 1, location_type: 'neutral', neutral_home_team: 'opponent', status: 'completed' },
    ]);
    expect(out.get('t1')).toMatchObject({ wins: 0, losses: 1, ties: 0, runsFor: 1, runsAgainst: 10 });
  });

  it('defaults a neutral game with no neutral_home_team to home', () => {
    const out = computeStandings([
      { team_id: 't1', opponent_team_id: 'o1', home_score: 6, away_score: 2, location_type: 'neutral', neutral_home_team: null, status: 'completed' },
    ]);
    expect(out.get('t1')).toMatchObject({ wins: 1, losses: 0, runsFor: 6, runsAgainst: 2 });
  });
});

describe('computeOpponentStandings', () => {
  it('credits the inverse record on a home game (recorder wins -> opponent loses)', () => {
    const out = computeOpponentStandings(
      [{ team_id: 't1', opponent_team_id: 'o1', home_score: 5, away_score: 3, location_type: 'home', neutral_home_team: null, status: 'completed' }],
      ['o1'],
    );
    expect(out.get('o1')).toMatchObject({ wins: 0, losses: 1, ties: 0, runsFor: 3, runsAgainst: 5 });
  });

  it('credits the inverse record on an away game using the away perspective', () => {
    // recorder t1 is away: their score = away_score (2), opponent score = home_score (4) -> opponent wins
    const out = computeOpponentStandings(
      [{ team_id: 't1', opponent_team_id: 'o1', home_score: 4, away_score: 2, location_type: 'away', neutral_home_team: null, status: 'completed' }],
      ['o1'],
    );
    expect(out.get('o1')).toMatchObject({ wins: 1, losses: 0, ties: 0, runsFor: 4, runsAgainst: 2 });
  });

  it("handles a neutral-site game where the recorder is the designated home team ('us')", () => {
    const out = computeOpponentStandings(
      [{ team_id: 't1', opponent_team_id: 'o1', home_score: 7, away_score: 2, location_type: 'neutral', neutral_home_team: 'us', status: 'completed' }],
      ['o1'],
    );
    // recorder home (7) beats opponent away (2) -> opponent loses, runsFor 2, runsAgainst 7
    expect(out.get('o1')).toMatchObject({ wins: 0, losses: 1, runsFor: 2, runsAgainst: 7 });
  });

  it("handles a neutral-site game where the recorder is not the designated home team ('opponent')", () => {
    const out = computeOpponentStandings(
      [{ team_id: 't1', opponent_team_id: 'o1', home_score: 7, away_score: 2, location_type: 'neutral', neutral_home_team: 'opponent', status: 'completed' }],
      ['o1'],
    );
    // recorder away (2), opponent home (7) -> opponent wins, runsFor 7, runsAgainst 2
    expect(out.get('o1')).toMatchObject({ wins: 1, losses: 0, runsFor: 7, runsAgainst: 2 });
  });

  it('records a tie when scores are equal', () => {
    const out = computeOpponentStandings(
      [{ team_id: 't1', opponent_team_id: 'o1', home_score: 4, away_score: 4, location_type: 'home', neutral_home_team: null, status: 'completed' }],
      ['o1'],
    );
    expect(out.get('o1')).toMatchObject({ wins: 0, losses: 0, ties: 1 });
  });

  it('seeds a zeroed record for an opponent member with no games', () => {
    const out = computeOpponentStandings([], ['o1']);
    expect(out.get('o1')).toMatchObject({ wins: 0, losses: 0, ties: 0, runsFor: 0, runsAgainst: 0, winPct: 0 });
  });

  it('ignores games whose opponent_team_id is null or not in the member set', () => {
    const out = computeOpponentStandings(
      [
        { team_id: 't1', opponent_team_id: null, home_score: 5, away_score: 3, location_type: 'home', neutral_home_team: null, status: 'completed' },
        { team_id: 't1', opponent_team_id: 'o2', home_score: 5, away_score: 3, location_type: 'home', neutral_home_team: null, status: 'completed' },
      ],
      ['o1'],
    );
    expect(out.get('o1')).toMatchObject({ wins: 0, losses: 0, ties: 0 });
    expect(out.has('o2')).toBe(false);
  });

  it('ignores non-completed games', () => {
    const out = computeOpponentStandings(
      [{ team_id: 't1', opponent_team_id: 'o1', home_score: 9, away_score: 0, location_type: 'home', neutral_home_team: null, status: 'scheduled' }],
      ['o1'],
    );
    expect(out.get('o1')).toMatchObject({ wins: 0, losses: 0, ties: 0 });
  });

  it('computes win_pct as W/(W+L+T) for a mixed record', () => {
    const out = computeOpponentStandings(
      [
        // opponent wins
        { team_id: 't1', opponent_team_id: 'o1', home_score: 1, away_score: 4, location_type: 'home', neutral_home_team: null, status: 'completed' },
        // opponent loses
        { team_id: 't2', opponent_team_id: 'o1', home_score: 6, away_score: 2, location_type: 'home', neutral_home_team: null, status: 'completed' },
        // opponent loses
        { team_id: 't2', opponent_team_id: 'o1', home_score: 5, away_score: 0, location_type: 'home', neutral_home_team: null, status: 'completed' },
      ],
      ['o1'],
    );
    expect(out.get('o1')).toMatchObject({ wins: 1, losses: 2, ties: 0 });
    expect(out.get('o1')!.winPct).toBeCloseTo(0.3333, 4);
  });
});
