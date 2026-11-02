import { mixHex, rgbChannels } from './color-math';
import {
  BASE_COLORS,
  NEUTRAL_RAMPS,
  SEMANTIC_TOKENS,
  SHADES,
  THEME_SURFACE,
  type PaletteColor,
  type ResolvedTheme,
  type SemanticToken,
  type Shade,
} from './palette';

export type ColorRole = 'bg' | 'fg' | 'line';

const BG_TINT: Partial<Record<Shade, number>> = { '50': 0.12, '100': 0.18, '200': 0.26, '300': 0.36 };
const LINE_TINT: Partial<Record<Shade, number>> = { '50': 0.18, '100': 0.25, '200': 0.35, '300': 0.45 };
const BRAND_BG: Partial<Record<Shade, string>> = {
  '600': '#2563eb',
  '700': '#2563eb',
  '800': '#1d4ed8',
  '900': '#1e40af',
};
const BRAND_LINE_LIFT: ReadonlySet<Shade> = new Set<Shade>(['500', '600', '700', '800', '900']);

/**
 * Hex for a role/color/shade under a theme. `shade` is ignored for
 * `white`/`black`. Defaults to '500' if omitted for a scale color.
 */
export function themedColor(
  theme: ResolvedTheme,
  role: ColorRole,
  color: PaletteColor | 'white' | 'black',
  shade: Shade = '500',
): string {
  if (theme === 'light') {
    if (color === 'white') return '#ffffff';
    if (color === 'black') return '#000000';
    return BASE_COLORS[color][shade];
  }

  const ramp = NEUTRAL_RAMPS[theme];
  if (color === 'white') return role === 'bg' ? ramp.bg.white : '#ffffff';
  if (color === 'black') return role === 'fg' ? ramp.black : '#000000';
  if (color === 'gray') return ramp[role][shade];

  const light = BASE_COLORS[color][shade];
  const surface = THEME_SURFACE[theme];
  const hue = BASE_COLORS[color];

  if (role === 'bg') {
    if (color === 'brand') {
      const brandBg = BRAND_BG[shade];
      if (brandBg) return brandBg;
    }
    const weight = BG_TINT[shade];
    return weight === undefined ? light : mixHex(hue['500'], surface, weight);
  }
  if (role === 'fg') {
    if (shade === '600' || shade === '700') return hue['400'];
    // Brand 500 (#1d4ed8) is only ~2:1 on charcoal; `text-brand-500` is common.
    if (color === 'brand' && shade === '500') return hue['400'];
    if (shade === '800' || shade === '900' || shade === '950') return hue['300'];
    return light;
  }
  // Brand lines (focus rings, brand borders) at 500-900 are 1.7-2.6:1 on
  // charcoal; lift them to brand-400 (>= 3:1 on every dark surface).
  if (color === 'brand' && BRAND_LINE_LIFT.has(shade)) return hue['400'];
  const weight = LINE_TINT[shade];
  return weight === undefined ? light : mixHex(hue['500'], surface, weight);
}

export function themeVarName(
  role: ColorRole,
  color: PaletteColor | 'white' | 'black',
  shade?: Shade,
): string {
  return shade === undefined ? `--dos-${role}-${color}` : `--dos-${role}-${color}-${shade}`;
}

export function semanticVarName(token: SemanticToken): string {
  return `--dos-app-${token}`;
}

const ROLES: readonly ColorRole[] = ['bg', 'fg', 'line'];
const cache = new Map<ResolvedTheme, Record<string, string>>();

/** CSS-variable map (`"R G B"` channels) for a theme. Memoized per theme; do not mutate. */
export function buildThemeVars(theme: ResolvedTheme): Record<string, string> {
  const hit = cache.get(theme);
  if (hit) return hit;

  const vars: Record<string, string> = {};
  for (const role of ROLES) {
    for (const c of ['white', 'black'] as const) {
      vars[themeVarName(role, c)] = rgbChannels(themedColor(theme, role, c));
    }
    for (const color of Object.keys(BASE_COLORS) as PaletteColor[]) {
      for (const shade of SHADES) {
        vars[themeVarName(role, color, shade)] = rgbChannels(themedColor(theme, role, color, shade));
      }
    }
  }
  for (const token of Object.keys(SEMANTIC_TOKENS[theme]) as SemanticToken[]) {
    vars[semanticVarName(token)] = rgbChannels(SEMANTIC_TOKENS[theme][token]);
  }
  cache.set(theme, vars);
  return vars;
}
