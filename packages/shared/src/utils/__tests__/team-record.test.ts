import { winPct } from '../team-record';

describe('winPct', () => {
  it('should count ties as games played', () => {
    expect(winPct({ wins: 2, losses: 1, ties: 1 })).toBe(0.5);
    expect(winPct({ wins: 3, losses: 1, ties: 0 })).toBe(0.75);
  });

  it('should be 0 before any games', () => {
    expect(winPct({ wins: 0, losses: 0, ties: 0 })).toBe(0);
  });
});
