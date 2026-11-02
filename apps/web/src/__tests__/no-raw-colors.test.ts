/**
 * Guard: themed UI must not hardcode colors.
 *
 * Hex literals and Tailwind hues outside the themed palette (slate, sky, teal,
 * ...) do not follow the Light/Dark/Dugout theme, so they render wrong in Dark.
 * Use `var(--app-*)`, `rgb(var(--dos-<role>-<color>-<shade>))`, or the themed
 * Tailwind classes instead.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..');

/**
 * Directories (relative to `src`) that are scanned. B6 scans only the shared
 * components; B7 widens this to include `app/(app)` by editing this one array.
 */
const SCAN_ROOTS = ['components'];
// B7: const SCAN_ROOTS = ['components', 'app/(app)'];

/** Directory prefixes (relative to `src`) that are never scanned. */
const EXCLUDED_DIRS = [
  'app/(app)/games/[gameId]/score/', // scorekeeping content stays Light
  'components/home/', // public landing page, always Light
];

/**
 * Files allowed to contain raw colors (path relative to `src`, forward
 * slashes). Every entry needs a concrete reason.
 */
export const RAW_COLOR_ALLOWLIST: Record<string, string> = {
  'components/auth/LoginForm.tsx':
    'Google "G" logo: third-party brand colors that must not change with the theme.',
};

const HEX_RE = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;
const UNTHEMED_HUE_RE =
  /\b(?:bg|text|border|ring|fill|stroke|from|to|via|divide|placeholder)-(?:slate|zinc|neutral|stone|lime|teal|cyan|sky|indigo|violet|fuchsia|pink|rose)-\d/;

function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
}

/** Does this line hold a hex literal inside a string or template literal? */
function hasHexInString(line: string): boolean {
  const match = HEX_RE.exec(line);
  if (!match) return false;
  // Ignore line comments and anything that is not quoted on the line.
  const code = line.replace(/\/\/.*$/, '');
  if (!HEX_RE.test(code)) return false;
  return /['"`][^'"`]*#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/.test(code);
}

function findOffenders(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) walk(path.join(SRC, root), files);

  const offenders: string[] = [];
  for (const file of files) {
    const rel = toPosix(path.relative(SRC, file));
    if (EXCLUDED_DIRS.some((dir) => rel.startsWith(dir))) continue;
    if (rel in RAW_COLOR_ALLOWLIST) continue;

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (hasHexInString(line) || UNTHEMED_HUE_RE.test(line)) {
        offenders.push(`src/${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }
  return offenders;
}

describe('no raw colors in themed UI', () => {
  it('has a reason for every allowlist entry', () => {
    for (const [file, reason] of Object.entries(RAW_COLOR_ALLOWLIST)) {
      expect(reason.trim().length).toBeGreaterThan(10);
      expect(fs.existsSync(path.join(SRC, file))).toBe(true);
    }
  });

  it('uses no hex literals or unthemed Tailwind hues', () => {
    const offenders = findOffenders();
    if (offenders.length > 0) {
      throw new Error(
        `${offenders.length} raw color(s) found. Use var(--app-*), ` +
          `rgb(var(--dos-<role>-<color>-<shade>)) or themed Tailwind classes, ` +
          `or add the file to RAW_COLOR_ALLOWLIST with a reason:\n` +
          offenders.join('\n'),
      );
    }
  });
});
