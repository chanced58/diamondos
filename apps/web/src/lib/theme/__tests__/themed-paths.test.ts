import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { isThemedPath, THEMED_PATH_PREFIXES } from '../themed-paths';

const APP_DIR = join(__dirname, '../../../app');

function subfolders(dir: string): string[] {
  return readdirSync(dir).filter(
    (name) =>
      !name.startsWith('_') &&
      !name.startsWith('(') &&
      statSync(join(dir, name)).isDirectory(),
  );
}

describe('isThemedPath', () => {
  it.each(['/dashboard', '/games/123', '/games/123/score', '/live/abc', '/players/me'])(
    'themes %s',
    (path) => {
      expect(isThemedPath(path)).toBe(true);
    },
  );

  it.each([
    '/',
    '/l/x',
    '/leagues',
    '/login',
    '/players/signup',
    '/p/abc',
    '/about',
    '/demo',
    '/offline',
    '/auth/callback',
  ])('keeps %s light', (path) => {
    expect(isThemedPath(path)).toBe(false);
  });

  it('matches on a segment boundary', () => {
    expect(isThemedPath('/league')).toBe(true);
    expect(isThemedPath('/league/x')).toBe(true);
    expect(isThemedPath('/leagues')).toBe(false);
    expect(isThemedPath('/players')).toBe(false);
    expect(isThemedPath('/players/mean')).toBe(false);
  });

  it('never lists bare /players', () => {
    expect(THEMED_PATH_PREFIXES).not.toContain('/players');
  });

  describe('disk walk', () => {
    it('themes every top-level (app) folder', () => {
      const missing: string[] = [];
      for (const seg of subfolders(join(APP_DIR, '(app)'))) {
        const paths =
          seg === 'players'
            ? subfolders(join(APP_DIR, '(app)', 'players')).map((s) => `/players/${s}`)
            : [`/${seg}`];
        for (const p of paths) if (!isThemedPath(p)) missing.push(p);
      }
      expect(missing).toEqual([]);
    });

    it('finds the (app) folders it is meant to cover', () => {
      expect(subfolders(join(APP_DIR, '(app)'))).toEqual(expect.arrayContaining(['dashboard', 'players']));
    });

    it('keeps every (auth) folder light, including nested ones', () => {
      const themed: string[] = [];
      const authDir = join(APP_DIR, '(auth)');
      for (const seg of subfolders(authDir)) {
        const paths = [`/${seg}`, ...subfolders(join(authDir, seg)).map((s) => `/${seg}/${s}`)];
        for (const p of paths) if (isThemedPath(p)) themed.push(p);
      }
      expect(themed).toEqual([]);
    });

    it.each(['/l', '/p', '/leagues', '/about', '/demo', '/offline', '/auth'])(
      'keeps public route %s light',
      (p) => {
        expect(isThemedPath(p)).toBe(false);
        expect(isThemedPath(`${p}/x`)).toBe(false);
      },
    );
  });
});
