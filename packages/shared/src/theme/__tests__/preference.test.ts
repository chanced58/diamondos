import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  parseThemePreference,
  resolveTheme,
} from '../preference';

describe('parseThemePreference', () => {
  it.each(['system', 'light', 'dark', 'dugout'] as const)('returns %s unchanged', (v) => {
    expect(parseThemePreference(v)).toBe(v);
  });

  it.each([null, undefined, '', 'navy', 'DARK'])('falls back to system for %p', (v) => {
    expect(parseThemePreference(v)).toBe('system');
  });
});

describe('constants', () => {
  it('lists preferences in order with system default', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark', 'dugout']);
    expect(DEFAULT_THEME_PREFERENCE).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('resolves system by the OS flag', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the system flag for explicit choices', () => {
    for (const flag of [true, false]) {
      expect(resolveTheme('light', flag)).toBe('light');
      expect(resolveTheme('dark', flag)).toBe('dark');
      expect(resolveTheme('dugout', flag)).toBe('dugout');
    }
  });
});
