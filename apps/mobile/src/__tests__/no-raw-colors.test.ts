/**
 * Guard: themed UI must not hardcode colors.
 *
 * Hex literals and Tailwind hues outside the themed palette (slate, sky, teal,
 * ...) do not follow the Light/Dark/Dugout theme, so they render wrong in Dark.
 * Use the themed Tailwind classes, or `useThemeColors()` / `themedColor()` for
 * imperative props (placeholderTextColor, icon and spinner colors, navigators).
 *
 * Mirrors apps/web/src/__tests__/no-raw-colors.test.ts.
 */
import fs from 'fs';
import path from 'path';

const MOBILE_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(MOBILE_ROOT, '..', '..');

/** Directories scanned, as [absolute dir, display prefix]. */
const SCAN_ROOTS: Array<[string, string]> = [
  [path.join(MOBILE_ROOT, 'app'), 'app'],
  [path.join(MOBILE_ROOT, 'src'), 'src'],
  [path.join(REPO_ROOT, 'packages/ui/src'), 'packages/ui/src'],
];

/** Path prefixes (relative to `apps/mobile`, forward slashes) that are never scanned. */
const EXCLUDED = [
  'src/features/scoring/', // scorekeeping content stays Light
  'app/(tabs)/schedule/games/[gameId]/score.tsx', // scorekeeping content stays Light
  'app/(auth)/', // always Light
  'app/auth-callback.tsx', // always Light
  'src/theme/', // the palette bridge itself
];

/**
 * Files under an excluded prefix that are scanned anyway: shared with themed
 * screens, so they render in Dark and Dugout, not only in the Light scorer.
 */
const SCANNED_DESPITE_EXCLUSION = [
  'src/features/scoring/GuestPlayerModal.tsx', // also on the themed lineup screen
  'src/features/scoring/BaserunnerDisplay.tsx', // also on the themed live viewer
];

/**
 * Files allowed to contain raw colors (path relative to `apps/mobile`, forward
 * slashes; `packages/ui/src/...` for the shared UI package). Every entry needs
 * a concrete reason.
 */
export const RAW_COLOR_ALLOWLIST: Record<string, string> = {
  'src/navigation/stack-options.ts':
    "Light branch of the shared stack header: the navy brand bar is Light's exact current look and must not change. Dark and Dugout read SEMANTIC_TOKENS.",
  'app/(tabs)/_layout.tsx':
    "Light branch of the tab bar styling: Light's exact current tint and border colors. Dark and Dugout read useThemeColors().",
  'src/features/scoring/BaserunnerDisplay.tsx':
    "The field illustration's fixed grass, dirt and chalk palette is a picture of a ballfield and must look the same in every theme (also on the themed live viewer). The pinch/courtesy runner sheet's bg-sky-700 buttons only open from the Light scorer, which passes the action handlers; the live viewer passes none. Light is unchanged.",
  'packages/ui/src/theme/colors.ts':
    "The shared Light brand palette constants (the definition of the hex values, not a use of them in UI).",
};

// 3-, 4-, 6- and 8-digit hex (4 and 8 carry an alpha channel).
const HEX_BODY = '#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\\b';
const HEX_RE = new RegExp(HEX_BODY);
const HEX_IN_STRING_RE = new RegExp(`['"\`][^'"\`]*${HEX_BODY}`);
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
export function hasHexInString(line: string): boolean {
  if (!HEX_RE.test(line)) return false;
  // Ignore line comments and anything that is not quoted on the line.
  const code = line.replace(/\/\/.*$/, '');
  if (!HEX_RE.test(code)) return false;
  return HEX_IN_STRING_RE.test(code);
}

function scannedFiles(): Array<{ file: string; rel: string }> {
  const result: Array<{ file: string; rel: string }> = [];
  for (const [dir, prefix] of SCAN_ROOTS) {
    const files: string[] = [];
    walk(dir, files);
    for (const file of files) {
      const rel = `${prefix}/${toPosix(path.relative(dir, file))}`;
      if (
        EXCLUDED.some((ex) => rel.startsWith(ex)) &&
        !SCANNED_DESPITE_EXCLUSION.includes(rel)
      ) {
        continue;
      }
      result.push({ file, rel });
    }
  }
  return result;
}

function findOffenders(): string[] {
  const offenders: string[] = [];
  for (const { file, rel } of scannedFiles()) {
    if (rel in RAW_COLOR_ALLOWLIST) continue;

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (hasHexInString(line) || UNTHEMED_HUE_RE.test(line)) {
        offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }
  return offenders;
}

describe('hex detection', () => {
  it('flags 3-, 4-, 6- and 8-digit hex inside a string', () => {
    expect(hasHexInString(`const a = '#fff';`)).toBe(true);
    expect(hasHexInString(`const a = '#fff8';`)).toBe(true);
    expect(hasHexInString(`const a = "#1a2b3c";`)).toBe(true);
    expect(hasHexInString('const a = `#1a2b3c4d`;')).toBe(true);
    expect(hasHexInString(`<TextInput placeholderTextColor="#9ca3af" />`)).toBe(true);
  });

  it('does not flag anchors, comments or unquoted text', () => {
    expect(hasHexInString(`<a href="#section">Jump</a>`)).toBe(false);
    expect(hasHexInString(`const a = 1; // #fff`)).toBe(false);
    expect(hasHexInString(`const id = #private;`)).toBe(false);
  });
});

describe('no raw colors in themed UI', () => {
  it('scans the app, src and shared ui roots', () => {
    const rels = scannedFiles().map((f) => f.rel);
    expect(rels.some((r) => r.startsWith('app/(tabs)/'))).toBe(true);
    expect(rels.some((r) => r.startsWith('src/features/'))).toBe(true);
    expect(rels.some((r) => r.startsWith('packages/ui/src/'))).toBe(true);
    // The scorer's own files are excluded, but the two shared with themed screens are scanned.
    expect(rels.filter((r) => r.startsWith('src/features/scoring/')).sort()).toEqual(
      SCANNED_DESPITE_EXCLUSION.slice().sort(),
    );
    expect(rels).not.toContain('app/(tabs)/schedule/games/[gameId]/score.tsx');
    expect(rels.some((r) => r.startsWith('app/(auth)/'))).toBe(false);
  });

  it('has a reason for every allowlist entry', () => {
    const roots = [MOBILE_ROOT, REPO_ROOT];
    for (const [file, reason] of Object.entries(RAW_COLOR_ALLOWLIST)) {
      expect(reason.trim().length).toBeGreaterThan(10);
      expect(roots.some((r) => fs.existsSync(path.join(r, file)))).toBe(true);
    }
  });

  it('uses no hex literals or unthemed Tailwind hues', () => {
    const offenders = findOffenders();
    if (offenders.length > 0) {
      throw new Error(
        `${offenders.length} raw color(s) found. Use useThemeColors() / themedColor() ` +
          `or themed Tailwind classes, or add the file to RAW_COLOR_ALLOWLIST with a reason:\n` +
          offenders.join('\n'),
      );
    }
  });
});
