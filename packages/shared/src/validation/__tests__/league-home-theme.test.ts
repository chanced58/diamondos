import {
  leagueHomeThemeSchema,
  DEFAULT_LEAGUE_HOME_THEME,
  mergeWithThemeDefaults,
  ALL_SECTIONS,
  LEAGUE_COLOR_SCHEMES,
  LEAGUE_COLOR_SCHEME_KEYS,
} from '../league-home-theme';

describe('leagueHomeThemeSchema', () => {
  it('accepts a full valid theme', () => {
    const r = leagueHomeThemeSchema.safeParse({
      accentColor: '#1e90ff', secondaryColor: '#0b1f3a',
      bannerUrl: 'https://x/y.png', heroTitle: 'Spring 2026', heroTagline: 'Play ball',
      sections: ALL_SECTIONS.map((id) => ({ id, enabled: true })),
    });
    expect(r.success).toBe(true);
  });
  it('rejects a bad hex color', () => {
    expect(leagueHomeThemeSchema.safeParse({ accentColor: 'blue' }).success).toBe(false);
  });
  it('rejects unknown section ids', () => {
    expect(leagueHomeThemeSchema.safeParse({ sections: [{ id: 'bogus', enabled: true }] }).success).toBe(false);
  });
  it('mergeWithThemeDefaults fills missing fields and all sections', () => {
    const merged = mergeWithThemeDefaults({ heroTitle: 'X' });
    expect(merged.heroTitle).toBe('X');
    expect(merged.accentColor).toBe(DEFAULT_LEAGUE_HOME_THEME.accentColor);
    expect(merged.sections.map((s) => s.id).sort()).toEqual([...ALL_SECTIONS].sort());
  });

  it('defaults colorScheme to sandlot (grass green + dirt brown)', () => {
    expect(DEFAULT_LEAGUE_HOME_THEME.colorScheme).toBe('sandlot');
  });

  it('mergeWithThemeDefaults fills colorScheme when missing', () => {
    expect(mergeWithThemeDefaults({}).colorScheme).toBe('sandlot');
  });

  it('mergeWithThemeDefaults keeps a provided colorScheme', () => {
    expect(mergeWithThemeDefaults({ colorScheme: 'crimson' }).colorScheme).toBe('crimson');
  });

  it('mergeWithThemeDefaults falls back to default for an unknown colorScheme', () => {
    expect(mergeWithThemeDefaults({ colorScheme: 'neon-zebra' }).colorScheme).toBe('sandlot');
  });

  it('schema rejects an unknown colorScheme', () => {
    expect(leagueHomeThemeSchema.safeParse({ ...DEFAULT_LEAGUE_HOME_THEME, colorScheme: 'neon-zebra' }).success).toBe(
      false,
    );
  });

  it('every preset in LEAGUE_COLOR_SCHEMES is a valid schema enum value', () => {
    const keys = LEAGUE_COLOR_SCHEMES.map((s) => s.key);
    expect(keys).toEqual([...LEAGUE_COLOR_SCHEME_KEYS]);
    for (const key of keys) {
      expect(
        leagueHomeThemeSchema.safeParse({ ...DEFAULT_LEAGUE_HOME_THEME, colorScheme: key }).success,
      ).toBe(true);
    }
  });
});
