import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The MaxPreps export (a Deno edge function) cannot import @baseball/shared,
 * so it carries a verbatim copy of rules/play-runners.ts between marker
 * comments in its stats.ts. This keeps the copy from drifting.
 */
describe('MaxPreps copy of play-runners', () => {
  it('should match rules/play-runners.ts exactly', () => {
    const original = readFileSync(join(__dirname, '..', 'play-runners.ts'), 'utf8');
    const statsSource = readFileSync(
      join(__dirname, '..', '..', '..', '..', '..', 'supabase', 'functions', 'maxpreps-export', 'stats.ts'),
      'utf8',
    );
    const begin = '// ── BEGIN verbatim copy of packages/shared/src/rules/play-runners.ts ──\n';
    const end = '// ── END verbatim copy of packages/shared/src/rules/play-runners.ts ──\n';
    const start = statsSource.indexOf(begin);
    const stop = statsSource.indexOf(end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(stop).toBeGreaterThan(start);
    expect(statsSource.slice(start + begin.length, stop)).toBe(original);
  });
});
