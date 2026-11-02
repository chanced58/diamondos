import { buildThemeVars } from '../theme-vars';
import { SEMANTIC_TOKENS, SHADES, THEMED_HUES } from '../palette';
import { semanticTailwindColors, themeVarsPlugin, themedTailwindColors } from '../tailwind';

type CssBlocks = Record<string, Record<string, unknown>>;

function runPlugin(themeSelectors: boolean): CssBlocks {
  const calls: CssBlocks[] = [];
  themeVarsPlugin({ themeSelectors })({ addBase: (css) => calls.push(css) });
  expect(calls).toHaveLength(1);
  return calls[0];
}

describe('themedTailwindColors', () => {
  const colors = themedTailwindColors();

  it('maps shade colors to role-specific CSS variables', () => {
    expect(colors.backgroundColor.gray['50']).toBe('rgb(var(--dos-bg-gray-50) / <alpha-value>)');
    expect(colors.textColor.red['700']).toBe('rgb(var(--dos-fg-red-700) / <alpha-value>)');
    expect(colors.ringColor.brand['500']).toBe('rgb(var(--dos-line-brand-500) / <alpha-value>)');
  });

  it('maps white and black as flat values', () => {
    expect(colors.backgroundColor.white).toBe('rgb(var(--dos-bg-white) / <alpha-value>)');
    expect(colors.textColor.black).toBe('rgb(var(--dos-fg-black) / <alpha-value>)');
  });

  it('uses the documented role for each utility family', () => {
    const roles: Record<string, string> = {
      backgroundColor: 'bg',
      gradientColorStops: 'bg',
      textColor: 'fg',
      placeholderColor: 'fg',
      fill: 'fg',
      stroke: 'fg',
      borderColor: 'line',
      divideColor: 'line',
      ringColor: 'line',
      outlineColor: 'line',
    };
    const all = colors as unknown as Record<string, Record<string, Record<string, string>>>;
    expect(Object.keys(all).sort()).toEqual(Object.keys(roles).sort());
    for (const [family, role] of Object.entries(roles)) {
      expect(all[family].gray['500']).toBe(`rgb(var(--dos-${role}-gray-500) / <alpha-value>)`);
    }
  });

  it('covers every themed hue and shade with variables that exist', () => {
    const vars = buildThemeVars('light');
    const bg = colors.backgroundColor as unknown as Record<string, Record<string, string>>;
    for (const hue of THEMED_HUES) {
      for (const shade of SHADES) {
        const name = /var\((--[^)]+)\)/.exec(bg[hue][shade])![1];
        expect(vars[name]).toBeDefined();
      }
    }
  });
});

describe('semanticTailwindColors', () => {
  it('maps every semantic token to its CSS variable', () => {
    const { app } = semanticTailwindColors();
    const tokens = Object.keys(SEMANTIC_TOKENS.light);
    expect(Object.keys(app).sort()).toEqual([...tokens].sort());
    expect(app.bg).toBe('rgb(var(--dos-app-bg) / <alpha-value>)');
    for (const token of tokens) {
      expect(app[token as keyof typeof app]).toBe(`rgb(var(--dos-app-${token}) / <alpha-value>)`);
    }
  });
});

describe('themeVarsPlugin', () => {
  it('emits light, dark, dugout and print blocks when themeSelectors is true', () => {
    const css = runPlugin(true);
    expect(Object.keys(css)).toEqual([
      ':root, [data-theme="light"]',
      '[data-theme="dark"]',
      '[data-theme="dugout"]',
      '@media print',
    ]);
    expect(css['[data-theme="dark"]']).toEqual(buildThemeVars('dark'));
    expect(css['[data-theme="dugout"]']).toEqual(buildThemeVars('dugout'));
    expect(css[':root, [data-theme="light"]']).toEqual(buildThemeVars('light'));
  });

  it('resolves every theme variable to Light under @media print, after the dark and dugout blocks', () => {
    const css = runPlugin(true);
    const keys = Object.keys(css);
    expect(keys.indexOf('@media print')).toBeGreaterThan(keys.indexOf('[data-theme="dugout"]'));
    const print = css['@media print'] as Record<string, Record<string, string>>;
    expect(Object.keys(print)).toEqual(['[data-theme="dark"], [data-theme="dugout"]']);
    expect(print['[data-theme="dark"], [data-theme="dugout"]']).toEqual(buildThemeVars('light'));
  });

  it('emits only :root when themeSelectors is false', () => {
    const css = runPlugin(false);
    expect(Object.keys(css)).toEqual([':root']);
    expect(css[':root']).toEqual(buildThemeVars('light'));
  });

  it('does not mutate the memoized var maps', () => {
    const before = { ...buildThemeVars('light') };
    (runPlugin(true)[':root, [data-theme="light"]'] as Record<string, string>)['--x'] = '1';
    expect(buildThemeVars('light')).toEqual(before);
  });
});
