import { DEFAULT_LEADER_CONFIG, mergeWithThemeDefaults, leaderQualifierMinimums } from '@baseball/shared';
import { resolveSeason, enabledSections, qualifierMinsFor } from '../league-context';
import { leagueStatsHref } from '../stats-href';

describe('resolveSeason', () => {
  const rows = [{ season: '2025' }, { season: '2026 Spring' }, { season: '2025' }];

  it('sorts seasons desc and dedupes', () => {
    expect(resolveSeason(rows, null).seasons).toEqual(['2026 Spring', '2025']);
  });
  it('param wins over current', () => {
    expect(resolveSeason(rows, '2026 Spring', '2025').season).toBe('2025');
  });
  it('falls back to current season', () => {
    expect(resolveSeason(rows, '2025').season).toBe('2025');
  });
  it('falls back to newest season', () => {
    expect(resolveSeason(rows, null).season).toBe('2026 Spring');
  });
  it('is empty string with no data', () => {
    expect(resolveSeason([], null)).toEqual({ season: '', seasons: [] });
  });
});

describe('qualifierMinsFor', () => {
  it('falls back to defaults on malformed config', () => {
    const r = qualifierMinsFor([{ wins: 1, losses: 0, ties: 0 }], { custom: 'nope' }, null);
    expect(r.leaderConfig).toEqual(DEFAULT_LEADER_CONFIG);
  });
  it('uses max of wins+losses+ties as games', () => {
    const rows = [
      { wins: 3, losses: 2, ties: 1 },
      { wins: 5, losses: 4, ties: 1 },
      { wins: 1, losses: 1, ties: 0 },
    ];
    const r = qualifierMinsFor(rows, {}, null);
    const expected = leaderQualifierMinimums(10, DEFAULT_LEADER_CONFIG.qualifierOverrides, null);
    expect({ paMin: r.paMin, ipOutsMin: r.ipOutsMin }).toEqual(expected);
  });
  it('uses zero games with no rows', () => {
    const r = qualifierMinsFor([], undefined, null);
    const expected = leaderQualifierMinimums(0, DEFAULT_LEADER_CONFIG.qualifierOverrides, null);
    expect({ paMin: r.paMin, ipOutsMin: r.ipOutsMin }).toEqual(expected);
  });
});

describe('enabledSections', () => {
  it('omits disabled ids', () => {
    const theme = mergeWithThemeDefaults({ sections: [{ id: 'recent', enabled: false }] });
    const s = enabledSections(theme);
    expect(s.has('recent')).toBe(false);
    expect(s.has('hero')).toBe(true);
  });
});

describe('leagueStatsHref', () => {
  it('builds with season and tab', () => {
    expect(leagueStatsHref('my-league', '2026 Spring', 'pitching')).toBe(
      '/l/my-league/stats?season=2026%20Spring&tab=pitching',
    );
  });
  it('omits absent params', () => {
    expect(leagueStatsHref('my-league')).toBe('/l/my-league/stats');
    expect(leagueStatsHref('my-league', undefined, 'teams')).toBe('/l/my-league/stats?tab=teams');
  });
});
