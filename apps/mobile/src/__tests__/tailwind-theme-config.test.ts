// eslint-disable-next-line @typescript-eslint/no-var-requires
const config = require('../../tailwind.config');

const extend = config.theme.extend;

const ROLE_UTILITIES = [
  'backgroundColor',
  'textColor',
  'borderColor',
  'divideColor',
  'ringColor',
  'outlineColor',
  'placeholderColor',
  'fill',
  'stroke',
  'gradientColorStops',
] as const;

describe('mobile tailwind config', () => {
  it('backs the role utilities with --dos-* variables', () => {
    expect(extend.backgroundColor.gray['50']).toContain('--dos-bg-gray-50');
    expect(extend.textColor.gray['900']).toContain('--dos-fg-gray-900');
    expect(extend.borderColor.gray['200']).toContain('--dos-line-gray-200');
  });

  it('adds the semantic app.* colors', () => {
    expect(extend.colors.app.surface).toContain('--dos-app-surface');
  });

  it('themes the bare border and divide default color', () => {
    const expected = 'rgb(var(--dos-line-gray-200) / <alpha-value>)';
    expect(extend.borderColor.DEFAULT).toBe(expected);
    expect(extend.divideColor.DEFAULT).toBe(expected);
  });

  it('registers the theme variables plugin', () => {
    expect(config.plugins.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the literal brand scale with only its legacy shades', () => {
    expect(Object.keys(extend.colors.brand)).toEqual(['50', '100', '500', '600', '700', '900']);
    expect(extend.colors.brand['500']).toBe('#1d4ed8');
  });

  it('prunes themed brand to the legacy shades and drops turf/clay (Light stays identical)', () => {
    for (const utility of ROLE_UTILITIES) {
      const map = extend[utility];
      expect(Object.keys(map.brand)).toEqual(['50', '100', '500', '600', '700', '900']);
      expect(map.turf).toBeUndefined();
      expect(map.clay).toBeUndefined();
      // Everything that already existed through Tailwind defaults stays.
      expect(map.gray['50']).toBeDefined();
      expect(map.white).toBeDefined();
      expect(map.black).toBeDefined();
      expect(map.red['500']).toBeDefined();
    }
  });

  it('leaves the scoring font sizes untouched', () => {
    expect(Object.keys(extend.fontSize)).toEqual([
      'score-xs',
      'score-sm',
      'score-base',
      'score-lg',
      'score-xl',
      'score-2xl',
      'score-10px',
      'score-11px',
      'score-12px',
      'score-13px',
      'score-15px',
    ]);
  });
});
