import { SEMANTIC_TOKENS } from '@baseball/shared';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_THEME_COLOR, THEME_COLORS } from '../theme-color';

describe('theme-color', () => {
  it('is navy for light, and the page bg for dark and dugout', () => {
    expect(THEME_COLORS).toEqual({ light: '#1e3a8a', dark: '#0f1115', dugout: '#08120a' });
    expect(THEME_COLORS.dark).toBe(SEMANTIC_TOKENS.dark.bg);
    expect(THEME_COLORS.dugout).toBe(SEMANTIC_TOKENS.dugout.bg);
  });

  it('defaults to the Light navy', () => {
    expect(DEFAULT_THEME_COLOR).toBe('#1e3a8a');
  });

  describe('root layout', () => {
    const layout = readFileSync(join(__dirname, '../../../app/layout.tsx'), 'utf8');

    it('renders a single theme-color meta with the Light default, not a prefers-color-scheme pair', () => {
      expect(layout).not.toContain('prefers-color-scheme');
      expect(layout).not.toMatch(/themeColor\s*:/);
      expect(layout.match(/name="theme-color"/g)).toHaveLength(1);
      expect(layout).toContain('content={DEFAULT_THEME_COLOR}');
    });

    it('renders the meta before the bootstrap script so the script can update it pre-paint', () => {
      expect(layout.indexOf('name="theme-color"')).toBeLessThan(layout.indexOf('<AppearanceBootstrap />'));
    });
  });
});
