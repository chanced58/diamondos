import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ScorerLightScope } from '../ScorerLightScope';

/**
 * Scorekeeping content stays Light in every theme. The Light island lives in
 * `ScoringBoard` itself (its exported component renders `ScorerLightScope`
 * around the board), so no consumer can render the board half-dark. These tests
 * pin the mechanism and scan every importer so a new consumer cannot bypass it.
 */
const SRC_DIR = join(__dirname, '../../../../../..'); // apps/web/src
const BOARD_SOURCE = readFileSync(join(__dirname, '..', 'ScoringBoard.tsx'), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('ScorerLightScope', () => {
  it('renders a Light island that resets surface and text colors', () => {
    const html = renderToStaticMarkup(createElement(ScorerLightScope, null, 'x'));
    expect(html).toContain('data-theme="light"');
    expect(html).toContain('bg-app-bg');
    expect(html).toContain('text-app-fg');
    expect(html).toContain('>x</div>');
  });
});

describe('ScoringBoard light scope', () => {
  it('exports ScoringBoard as a wrapper that renders ScorerLightScope around the board', () => {
    const exported = /export function ScoringBoard\(props[^)]*\)[^{]*\{([\s\S]*?)\n\}\n/.exec(BOARD_SOURCE);
    expect(exported).not.toBeNull();
    const body = exported![1];
    expect(body).toMatch(/<ScorerLightScope>\s*<ScoringBoardContent \{\.\.\.props\} \/>\s*<\/ScorerLightScope>/);
  });

  it('keeps the unwrapped board private', () => {
    expect(BOARD_SOURCE).not.toMatch(/export (default )?(async )?function ScoringBoardContent/);
    expect(BOARD_SOURCE).not.toMatch(/export \{[^}]*ScoringBoardContent/);
    expect(BOARD_SOURCE).toMatch(/^function ScoringBoardContent\(/m);
  });

  it('has exactly one exported ScoringBoard and no other exported board component', () => {
    const exportedComponents = BOARD_SOURCE.match(/^export (?:default )?(?:async )?function (\w*Board\w*)/gm) ?? [];
    expect(exportedComponents).toEqual(['export function ScoringBoard']);
  });

  it('is imported only through the exported ScoringBoard, by at least the known consumers', () => {
    const boardFile = join(__dirname, '..', 'ScoringBoard.tsx');
    const importers = sourceFiles(SRC_DIR).filter((file) => {
      if (file === boardFile || file.includes(`${join('score', '__tests__')}`)) return false;
      return /from\s+['"][^'"]*score\/ScoringBoard['"]|from\s+['"]\.\/ScoringBoard['"]/.test(
        readFileSync(file, 'utf8'),
      );
    });
    const names = importers.map((f) => relative(SRC_DIR, f).split('\\').join('/')).sort();
    expect(names).toEqual(
      expect.arrayContaining([
        'app/(app)/games/[gameId]/score/page.tsx',
        'app/(app)/games/demo/page.tsx',
      ]),
    );
    for (const file of importers) {
      const source = readFileSync(file, 'utf8');
      const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*ScoringBoard['"]/g)].flatMap(
        (m) => m[1].split(',').map((s) => s.trim()),
      );
      expect(imports).toEqual(['ScoringBoard']);
    }
  });

  it('no longer needs (or keeps) a per-page wrapper', () => {
    const page = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8');
    expect(page).not.toContain('data-theme="light"');
  });
});
