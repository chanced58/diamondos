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

describe('globals.css print fallback', () => {
  const printBlock = (): string => {
    const start = css.indexOf('@media print {');
    if (start === -1) throw new Error('@media print block not found');
    return css.slice(start, css.indexOf('\n  }\n', start));
  };

  it('resets Dark and Dugout chart tokens and color-scheme to Light under @media print', () => {
    const block = printBlock();
    expect(block).toContain('[data-theme="dark"],');
    expect(block).toContain('[data-theme="dugout"]');
    expect(block).toContain('color-scheme: light');
    // light values equal the :root declarations
    const light = ruleBody(':root, [data-theme="light"]');
    for (const token of ['--field-dirt-2', '--pz-label', '--tint-neutral', '--link-sky', '--pz-swing']) {
      const re = new RegExp(`${token}:\\s*([^;]+);`);
      const lightValue = re.exec(light)?.[1].trim();
      expect(lightValue).toBeDefined();
      expect(re.exec(block)?.[1].trim()).toBe(lightValue);
    }
  });

  it('comes after the Dark and Dugout chart overrides so it wins at equal specificity', () => {
    expect(css.indexOf('@media print {')).toBeGreaterThan(css.indexOf('--link-sky:         #60a5fa'));
  });
});

describe('globals.css dark-mode contrast rules', () => {
  const DARK_FORM_RULE =
    ':where([data-theme="dark"], [data-theme="dugout"]) :where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea)';
  const LIGHT_FORM_RULE =
    ':where([data-theme="light"]) :where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea)';

  it('lifts bare form-control borders to line-gray-300 in Dark and Dugout', () => {
    expect(ruleBody(DARK_FORM_RULE)).toMatch(/border-color:\s*rgb\(var\(--dos-line-gray-300\)\)/);
  });

  it('resets Light islands to the Preflight border color after the dark rule', () => {
    expect(ruleBody(LIGHT_FORM_RULE)).toMatch(/border-color:\s*rgb\(var\(--dos-line-gray-200\)\)/);
    expect(css.indexOf(LIGHT_FORM_RULE)).toBeGreaterThan(css.indexOf(DARK_FORM_RULE));
  });

  describe('explicit border-gray-200 form controls', () => {
    const DARK_EXPLICIT =
      ':where([data-theme="dark"], [data-theme="dugout"]) :is(input, select, textarea).border-gray-200';
    const LIGHT_EXPLICIT =
      ':where([data-theme="light"]) :is(input, select, textarea).border-gray-200';

    it('lifts input/select/textarea.border-gray-200 to line-gray-300 in Dark and Dugout', () => {
      expect(ruleBody(DARK_EXPLICIT)).toMatch(/border-color:\s*rgb\(var\(--dos-line-gray-300\)\)/);
    });

    it('resets Light islands to line-gray-200 after the dark rule', () => {
      expect(ruleBody(LIGHT_EXPLICIT)).toMatch(/border-color:\s*rgb\(var\(--dos-line-gray-200\)\)/);
      expect(css.indexOf(LIGHT_EXPLICIT)).toBeGreaterThan(css.indexOf(DARK_EXPLICIT));
    });

    it('is in the base layer so focus/hover border utilities still win', () => {
      const baseEnd = css.indexOf('@layer components');
      expect(css.indexOf(DARK_EXPLICIT)).toBeGreaterThan(-1);
      expect(css.indexOf(DARK_EXPLICIT)).toBeLessThan(baseEnd);
      expect(css.indexOf(LIGHT_EXPLICIT)).toBeLessThan(baseEnd);
    });
  });

  it('has no unscoped (Light) rule for the form-control border', () => {
    const bare = css
      .split('\n')
      .filter((line) => /^\s*(?:input|select|textarea)\b[^{]*\{[^}]*border-color/.test(line));
    expect(bare).toEqual([]);
  });

  it('uses brand-600 for the slate button and line-gray-300 for the slate choice in Dark and Dugout', () => {
    expect(css).toMatch(
      /\[data-theme="dugout"\] \.slate-btn\s*\{\s*background:\s*rgb\(var\(--dos-bg-brand-600\)\)/,
    );
    expect(css).toMatch(
      /\[data-theme="dugout"\] \.slate-choice\s*\{\s*border-color:\s*rgb\(var\(--dos-line-gray-300\)\)/,
    );
    expect(css).not.toMatch(/\.slate-btn\s*\{\s*background:\s*var\(--app-brand\)/);
  });

  it('keeps .trend-dn at #dc2626 in Light and lifts it to fg-red-700 in Dark and Dugout', () => {
    expect(ruleBody('.trend-dn')).toMatch(/color:\s*#dc2626/);
    expect(css).toMatch(
      /\[data-theme="dark"\] \.trend-dn,\s*\[data-theme="dugout"\] \.trend-dn\s*\{\s*color:\s*rgb\(var\(--dos-fg-red-700\)\)/,
    );
    expect(css.indexOf('[data-theme="light"] .trend-dn')).toBeGreaterThan(
      css.indexOf('[data-theme="dark"] .trend-dn'),
    );
    expect(ruleBody('[data-theme="light"] .trend-dn')).toMatch(/color:\s*#dc2626/);
  });

  it.each([
    'pill-sky',
    'pill-violet',
    'pill-indigo',
    'slate-fg-muted',
    'slate-fg-subtle',
    'slate-divider',
    'slate-choice',
    'slate-choice-on',
    'slate-btn',
  ])('re-declares .%s for Light islands after the Dark rule', (cls) => {
    const dark = css.indexOf(`[data-theme="dark"] .${cls}`);
    const light = css.indexOf(`[data-theme="light"] .${cls}`);
    expect(dark).toBeGreaterThan(-1);
    expect(light).toBeGreaterThan(dark);
  });
});
