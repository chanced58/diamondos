import { SEMANTIC_TOKENS } from '@baseball/shared';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { THEME_COLORS } from '../theme-color';

const APP_DIR = join(__dirname, '../../../app');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('theme-color', () => {
  it('is navy for light, and the page bg for dark and dugout', () => {
    expect(THEME_COLORS).toEqual({ light: '#1e3a8a', dark: '#0f1115', dugout: '#08120a' });
    expect(THEME_COLORS.dark).toBe(SEMANTIC_TOKENS.dark.bg);
    expect(THEME_COLORS.dugout).toBe(SEMANTIC_TOKENS.dugout.bg);
  });

  // The bootstrap script owns the meta. A React-rendered one (JSX or Next's
  // `viewport.themeColor`) is duplicated at hydration in Dark and Dugout; see
  // theme-color-hydration.test.ts.
  it('is never rendered by a route: no theme-color meta or viewport themeColor under src/app', () => {
    const offenders = sourceFiles(APP_DIR).filter((file) => {
      const source = readFileSync(file, 'utf8');
      return /name=["']theme-color["']/.test(source) || /themeColor\s*:/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it('the root layout renders the bootstrap script in <head>', () => {
    const layout = readFileSync(join(APP_DIR, 'layout.tsx'), 'utf8');
    const head = layout.slice(layout.indexOf('<head>'), layout.indexOf('</head>'));
    expect(head).toContain('<AppearanceBootstrap />');
  });
});
