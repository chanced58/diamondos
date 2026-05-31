import { selectSpotlights, type SpotlightCandidate } from '../league-spotlight';

const batters: SpotlightCandidate[] = [
  { id: 'p1', name: 'P1', teamName: 'Reds', score: 1.2, qualifierValue: 10 },
  { id: 'p2', name: 'P2', teamName: 'Jays', score: 0.9, qualifierValue: 10 },
  { id: 'p3', name: 'P3', teamName: 'Reds', score: 2.0, qualifierValue: 1 },
];
const teams: SpotlightCandidate[] = [
  { id: 't1', name: 'Reds', score: 0.8, qualifierValue: 3 },
  { id: 't2', name: 'Jays', score: 0.5, qualifierValue: 3 },
];

describe('selectSpotlights', () => {
  it('picks the top qualified batter and hottest team', () => {
    const out = selectSpotlights({ batters, teams, minBatterQualifier: 5 });
    expect(out.playerOfWeek?.id).toBe('p1');
    expect(out.hotTeam?.id).toBe('t1');
  });
  it('returns nulls when no candidates qualify', () => {
    const out = selectSpotlights({ batters: [], teams: [], minBatterQualifier: 5 });
    expect(out.playerOfWeek).toBeNull(); expect(out.hotTeam).toBeNull();
  });
});
