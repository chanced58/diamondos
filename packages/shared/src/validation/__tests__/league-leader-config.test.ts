import { leagueLeaderConfigSchema, DEFAULT_LEADER_CONFIG } from '../league-leader-config';

describe('leagueLeaderConfigSchema', () => {
  it('accepts up to 5 custom categories referencing catalog keys', () => {
    const r = leagueLeaderConfigSchema.safeParse({
      custom: [
        { statKey: 'doubles', label: 'Doubles Kings', limit: 10 },
        { statKey: 'whip', label: 'Stingiest', limit: 5 },
      ],
      qualifierOverrides: { paPerGame: 2.5, ipPerGame: 1.0 },
    });
    expect(r.success).toBe(true);
  });
  it('rejects more than 5 custom categories', () => {
    const custom = Array.from({ length: 6 }, (_, i) => ({ statKey: 'hits', label: `c${i}`, limit: 10 }));
    expect(leagueLeaderConfigSchema.safeParse({ custom }).success).toBe(false);
  });
  it('rejects a statKey not in the catalog', () => {
    expect(leagueLeaderConfigSchema.safeParse({ custom: [{ statKey: 'zzz', label: 'x', limit: 10 }] }).success).toBe(false);
  });
  it('DEFAULT_LEADER_CONFIG has empty custom list', () => {
    expect(DEFAULT_LEADER_CONFIG.custom).toEqual([]);
  });
});
