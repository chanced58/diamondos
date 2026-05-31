import { leagueHomeThemeSchema, DEFAULT_LEAGUE_HOME_THEME, mergeWithThemeDefaults, ALL_SECTIONS } from '../league-home-theme';

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
});
