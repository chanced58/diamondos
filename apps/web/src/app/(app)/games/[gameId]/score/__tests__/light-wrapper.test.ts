import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Scorekeeping content stays Light in every theme. ScorePage is a server
 * component, so rather than render it we assert on its source: every
 * top-level `return` that renders JSX must be wrapped in an element carrying
 * data-theme="light" (which resets all theme variables for its subtree).
 */
describe('ScorePage light wrapper', () => {
  const source = readFileSync(join(__dirname, '..', 'page.tsx'), 'utf8');
  const start = source.indexOf('export default async function ScorePage');
  const body = source.slice(start);
  const lines = body.split('\n');

  // Top-level statements of the function body are indented exactly two spaces.
  const returnIndexes = lines
    .map((line, i) => (/^ {2}return\b/.test(line) ? i : -1))
    .filter((i) => i >= 0);

  const contentReturns = returnIndexes.filter(
    (i) => !/^ {2}return\s+null\s*;?\s*$/.test(lines[i]) && !/^ {2}if\b/.test(lines[i]),
  );

  it('has at least one content-rendering top-level return', () => {
    expect(start).toBeGreaterThan(-1);
    expect(contentReturns.length).toBeGreaterThan(0);
  });

  it('wraps every content-rendering return in data-theme="light"', () => {
    for (const i of contentReturns) {
      // `return (` followed by the wrapper element on the next line.
      expect(lines[i].trim()).toBe('return (');
      expect(lines[i + 1]).toMatch(/^ {4}<div\b[^>]*data-theme="light"/);
    }
  });

  it('closes the wrapper before the end of the return', () => {
    for (const i of contentReturns) {
      const end = lines.findIndex((l, j) => j > i && /^ {2}\);\s*$/.test(l));
      expect(end).toBeGreaterThan(i);
      expect(lines[end - 1]).toMatch(/^ {4}<\/div>\s*$/);
    }
  });
});
