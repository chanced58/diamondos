/**
 * Tailwind integration helpers. Intentionally does NOT import tailwindcss and
 * is NOT re-exported from `./index`: Tailwind configs load this file by
 * relative path (via jiti), so keep imports relative and avoid TS-only
 * runtime features (enums, namespaces).
 */
import { semanticVarName, themeVarName, buildThemeVars, type ColorRole } from './theme-vars';
import { SEMANTIC_TOKENS, SHADES, THEMED_HUES, type SemanticToken, type ThemedHue } from './palette';

type ShadeMap = Record<string, string>;
export type ThemedColorMap = Record<ThemedHue | 'gray', ShadeMap> & {
  white: string;
  black: string;
};

export interface ThemedTailwindColors {
  backgroundColor: ThemedColorMap;
  textColor: ThemedColorMap;
  borderColor: ThemedColorMap;
  divideColor: ThemedColorMap;
  ringColor: ThemedColorMap;
  outlineColor: ThemedColorMap;
  placeholderColor: ThemedColorMap;
  fill: ThemedColorMap;
  stroke: ThemedColorMap;
  gradientColorStops: ThemedColorMap;
}

const ALPHA = '<alpha-value>';

function rgbVar(name: string): string {
  return `rgb(var(${name}) / ${ALPHA})`;
}

function colorMapFor(role: ColorRole): ThemedColorMap {
  const map: Record<string, string | ShadeMap> = {
    white: rgbVar(themeVarName(role, 'white')),
    black: rgbVar(themeVarName(role, 'black')),
  };
  for (const color of ['gray', ...THEMED_HUES] as const) {
    const shades: ShadeMap = {};
    for (const shade of SHADES) {
      shades[shade] = rgbVar(themeVarName(role, color, shade));
    }
    map[color] = shades;
  }
  return map as ThemedColorMap;
}

/** Per-utility color extensions that resolve through the `--dos-*` variables. */
export function themedTailwindColors(): ThemedTailwindColors {
  return {
    backgroundColor: colorMapFor('bg'),
    gradientColorStops: colorMapFor('bg'),
    textColor: colorMapFor('fg'),
    placeholderColor: colorMapFor('fg'),
    fill: colorMapFor('fg'),
    stroke: colorMapFor('fg'),
    borderColor: colorMapFor('line'),
    divideColor: colorMapFor('line'),
    ringColor: colorMapFor('line'),
    outlineColor: colorMapFor('line'),
  };
}

/**
 * Semantic `app.*` colors backed by `--dos-app-*` channel variables.
 * Mobile only; web keeps its `var(--app-*)` mapping so league color schemes
 * can override `--app-brand` directly.
 */
export function semanticTailwindColors(): { app: Record<SemanticToken, string> } {
  const app = {} as Record<SemanticToken, string>;
  for (const token of Object.keys(SEMANTIC_TOKENS.light) as SemanticToken[]) {
    app[token] = rgbVar(semanticVarName(token));
  }
  return { app };
}

type VarBlock = Record<string, string>;

export interface ThemeVarsPluginApi {
  addBase(css: Record<string, VarBlock | Record<string, VarBlock>>): void;
}

/**
 * Plain-function Tailwind plugin (accepted in `plugins` as-is) that emits the
 * theme CSS variables. Light is the `:root` default; with `themeSelectors`
 * the dark and dugout maps are emitted under `[data-theme]` selectors, followed
 * by an `@media print` block that resolves dark and dugout back to the Light map
 * (paper is white; this backs up the runtime beforeprint switch).
 */
export function themeVarsPlugin(options: {
  themeSelectors: boolean;
}): (api: ThemeVarsPluginApi) => void {
  return ({ addBase }) => {
    // Copy: buildThemeVars returns a shared memoized object.
    if (!options.themeSelectors) {
      addBase({ ':root': { ...buildThemeVars('light') } });
      return;
    }
    addBase({
      ':root, [data-theme="light"]': { ...buildThemeVars('light') },
      '[data-theme="dark"]': { ...buildThemeVars('dark') },
      '[data-theme="dugout"]': { ...buildThemeVars('dugout') },
      '@media print': {
        '[data-theme="dark"], [data-theme="dugout"]': { ...buildThemeVars('light') },
      },
    });
  };
}
