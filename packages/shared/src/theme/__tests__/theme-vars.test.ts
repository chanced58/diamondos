import { contrastRatio } from '../color-math';
import {
  BASE_COLORS,
  RESOLVED_THEMES,
  SEMANTIC_TOKENS,
  SHADES,
  THEMED_HUES,
  type PaletteColor,
  type SemanticToken,
} from '../palette';
import {
  buildThemeVars,
  semanticVarName,
  themeVarName,
  themedColor,
  type ColorRole,
} from '../theme-vars';

const ROLES: ColorRole[] = ['bg', 'fg', 'line'];
const COLORS = Object.keys(BASE_COLORS) as PaletteColor[];
const DARK_THEMES = ['dark', 'dugout'] as const;

describe('themedColor', () => {
  it('light equals the base scale for every role/color/shade', () => {
    for (const role of ROLES) {
      for (const color of COLORS) {
        for (const shade of SHADES) {
          expect(themedColor('light', role, color, shade)).toBe(BASE_COLORS[color][shade]);
        }
      }
    }
  });

  it('light white/black are fixed', () => {
    for (const role of ROLES) {
      expect(themedColor('light', role, 'white')).toBe('#ffffff');
      expect(themedColor('light', role, 'black')).toBe('#000000');
    }
  });

  it('maps white/black through the neutral ramp in dark', () => {
    expect(themedColor('dark', 'bg', 'white')).toBe('#181b22');
    expect(themedColor('dark', 'fg', 'white')).toBe('#ffffff');
    expect(themedColor('dark', 'fg', 'black')).toBe('#e7e9ee');
    expect(themedColor('dark', 'bg', 'black')).toBe('#000000');
    expect(themedColor('dark', 'line', 'black')).toBe('#000000');
    expect(themedColor('dark', 'line', 'white')).toBe('#ffffff');
  });

  it('applies the brand exception and hue foreground lifts', () => {
    expect(themedColor('dark', 'bg', 'brand', '700')).toBe('#2563eb');
    expect(themedColor('dark', 'bg', 'brand', '800')).toBe('#1d4ed8');
    expect(themedColor('dark', 'bg', 'brand', '900')).toBe('#1e40af');
    expect(themedColor('dark', 'fg', 'red', '700')).toBe(BASE_COLORS.red['400']);
    expect(themedColor('dark', 'fg', 'red', '900')).toBe(BASE_COLORS.red['300']);
    expect(themedColor('dark', 'fg', 'red', '500')).toBe(BASE_COLORS.red['500']);
  });

  it('tints hue backgrounds into the surface', () => {
    for (const theme of DARK_THEMES) {
      for (const shade of ['50', '100', '200', '300'] as const) {
        expect(themedColor(theme, 'bg', 'red', shade)).toMatch(/^#[0-9a-f]{6}$/);
      }
      // untouched shades remain the light value
      expect(themedColor(theme, 'bg', 'red', '500')).toBe(BASE_COLORS.red['500']);
      expect(themedColor(theme, 'line', 'red', '600')).toBe(BASE_COLORS.red['600']);
    }
  });
});

describe.each(DARK_THEMES)('contrast in %s', (theme) => {
  const surfaces = (): string[] => [
    themedColor(theme, 'bg', 'white'),
    themedColor(theme, 'bg', 'gray', '50'),
    themedColor(theme, 'bg', 'gray', '100'),
    SEMANTIC_TOKENS[theme].bg,
  ];

  it.each(['900', '800', '700', '600', '500'] as const)(
    'fg gray %s >= 4.5 on surfaces',
    (shade) => {
      const fg = themedColor(theme, 'fg', 'gray', shade);
      for (const s of surfaces()) {
        expect(contrastRatio(fg, s)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it('fg gray 400 >= 3 on surfaces', () => {
    const fg = themedColor(theme, 'fg', 'gray', '400');
    for (const s of surfaces()) {
      expect(contrastRatio(fg, s)).toBeGreaterThanOrEqual(3);
    }
  });

  it('line gray 300 >= 3 on bg white (input borders)', () => {
    expect(
      contrastRatio(themedColor(theme, 'line', 'gray', '300'), themedColor(theme, 'bg', 'white')),
    ).toBeGreaterThanOrEqual(3);
  });

  it.each([...THEMED_HUES])('hue %s fg 700/600 are legible', (hue) => {
    const white = themedColor(theme, 'bg', 'white');
    expect(
      contrastRatio(themedColor(theme, 'fg', hue, '700'), themedColor(theme, 'bg', hue, '50')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(themedColor(theme, 'fg', hue, '700'), white),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(themedColor(theme, 'fg', hue, '600'), white),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it('white text on bg brand 700 >= 4.5', () => {
    expect(contrastRatio('#ffffff', themedColor(theme, 'bg', 'brand', '700'))).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('semantic tokens meet contrast on every surface', () => {
    const t = SEMANTIC_TOKENS[theme];
    const surf: SemanticToken[] = ['surface', 'surface-2', 'surface-raised', 'bg'];
    for (const s of surf) {
      expect(contrastRatio(t.fg, t[s])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['fg-muted'], t[s])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t['fg-subtle'], t[s])).toBeGreaterThanOrEqual(3);
    }
  });
});

it('white text on dark brand >= 4.5', () => {
  expect(contrastRatio('#ffffff', SEMANTIC_TOKENS.dark.brand)).toBeGreaterThanOrEqual(4.5);
});

describe('var names', () => {
  it('builds theme and semantic var names', () => {
    expect(themeVarName('bg', 'white')).toBe('--dos-bg-white');
    expect(themeVarName('fg', 'gray', '700')).toBe('--dos-fg-gray-700');
    expect(semanticVarName('surface-2')).toBe('--dos-app-surface-2');
  });
});

describe('buildThemeVars', () => {
  it('emits channel triplets', () => {
    expect(buildThemeVars('dark')['--dos-bg-white']).toBe('24 27 34');
    expect(buildThemeVars('light')['--dos-app-surface']).toBe('255 255 255');
  });

  it('has identical key sets across themes and the expected size', () => {
    const keys = RESOLVED_THEMES.map((t) => Object.keys(buildThemeVars(t)).sort());
    expect(keys[1]).toEqual(keys[0]);
    expect(keys[2]).toEqual(keys[0]);
    const expected =
      ROLES.length * (2 + COLORS.length * SHADES.length) +
      Object.keys(SEMANTIC_TOKENS.light).length;
    expect(keys[0]).toHaveLength(expected);
  });

  it('memoizes per theme', () => {
    expect(buildThemeVars('dark')).toBe(buildThemeVars('dark'));
  });
});
