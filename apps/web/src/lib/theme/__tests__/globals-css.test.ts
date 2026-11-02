import { readFileSync } from 'fs';
import { join } from 'path';
import { LEAGUE_COLOR_SCHEME_KEYS } from '@baseball/shared';

const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');

/** Body of the first rule whose selector is exactly `selector`. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`rule not found: ${selector}`);
  return match[1];
}

describe('globals.css theme blocks', () => {
  it('declares the light tokens on :root and [data-theme="light"]', () => {
    const body = ruleBody(':root, [data-theme="light"]');
    expect(body).toContain('color-scheme: light');
    expect(body).toMatch(/--app-bg:\s*rgb\(var\(--dos-app-bg\)\)/);
  });

  it.each(['dark', 'dugout'])('has no --app-* hex values in the %s block', (theme) => {
    const body = ruleBody(`[data-theme="${theme}"]`);
    expect(body).toContain('color-scheme: dark');
    expect(body).not.toMatch(/--app-[a-z0-9-]+:/);
  });

  it('resolves every --app-* token from a --dos-app-* variable', () => {
    const body = ruleBody(':root, [data-theme="light"]');
    const decls = body.match(/--app-[a-z0-9-]+:\s*[^;]+;/g) ?? [];
    expect(decls.length).toBeGreaterThanOrEqual(15);
    for (const decl of decls) {
      expect(decl).toMatch(/:\s*rgb\(var\(--dos-app-[a-z0-9-]+\)\);/);
    }
  });

  it('points legacy semantic vars at the app tokens', () => {
    const body = ruleBody(':root, [data-theme="light"]');
    expect(body).toMatch(/--bg:\s*var\(--app-bg\)/);
    expect(body).toMatch(/--bg-surface:\s*var\(--app-surface\)/);
    expect(body).toMatch(/--fg:\s*var\(--app-fg\)/);
    expect(body).toMatch(/--border-strong:\s*var\(--app-border-strong\)/);
  });

  it('backs tinted helpers with theme variables', () => {
    const body = ruleBody(':root, [data-theme="light"]');
    expect(body).toContain('--green-50: rgb(var(--dos-bg-green-50))');
    expect(body).toContain('--red-700: rgb(var(--dos-fg-red-700))');
  });

  it('leaves no var(--gray-*) references outside the neutral scale', () => {
    const uses = css.split('\n').filter((line) => /var\(--gray-/.test(line));
    expect(uses).toEqual([]);
  });

  it.each([...LEAGUE_COLOR_SCHEME_KEYS])('has a dugout rule for league scheme %s', (key) => {
    expect(css).toContain(`[data-theme="dugout"] .league-scheme-${key}`);
  });

  it('applies team sidebar branding only in light', () => {
    expect(css).toContain('[data-theme="light"] .sidebar');
    expect(css).toContain('--app-sidebar-bg: var(--team-sidebar-bg');
    expect(css).toContain('--app-sidebar-active: var(--team-sidebar-active');
  });
});
