import { runInNewContext } from 'node:vm';
import { buildAppearanceBootstrapScript } from '../bootstrap-script';

interface Env {
  stored?: Record<string, string>;
  pathname: string;
  systemDark?: boolean;
  reducedMotion?: boolean;
  getItemThrows?: boolean;
  noMatchMedia?: boolean;
  matchMediaThrows?: boolean;
  /** theme-color metas already in the page. The server renders none (the default). */
  metas?: number;
  noQuerySelectorAll?: boolean;
}

type Result = Record<string, string>;
const lastMetas: Array<{ content: string }> = [];

function run(env: Env): Result {
  const attrs: Record<string, string> = {};
  lastMetas.length = 0;
  for (let i = 0; i < (env.metas ?? 0); i += 1) lastMetas.push({ content: '#1e3a8a' });
  const metaElement = (m: { content: string }) => ({
    setAttribute: (k: string, v: string) => {
      if (k === 'content') m.content = v;
    },
  });
  const sandbox: Record<string, unknown> = {
    document: {
      documentElement: {
        setAttribute: (k: string, v: string) => {
          attrs[k] = v;
        },
      },
      ...(env.noQuerySelectorAll
        ? {}
        : {
            querySelectorAll: (sel: string) =>
              sel === 'meta[name="theme-color"]' ? lastMetas.map(metaElement) : [],
            createElement: (tag: string) => {
              const created = { tag, name: '', content: '' };
              return {
                created,
                setAttribute: (k: string, v: string) => {
                  if (k === 'name') created.name = v;
                  if (k === 'content') created.content = v;
                },
              };
            },
            head: {
              appendChild: (el: { created: { tag: string; name: string; content: string } }) => {
                if (el.created.tag !== 'meta' || el.created.name !== 'theme-color') return;
                // Live view of the created element, so later setAttribute calls land.
                lastMetas.push(el.created);
              },
            },
          }),
    },
    localStorage: {
      getItem: (k: string) => {
        if (env.getItemThrows) throw new Error('denied');
        return env.stored?.[k] ?? null;
      },
    },
    location: { pathname: env.pathname },
  };
  if (!env.noMatchMedia) {
    sandbox.matchMedia = (q: string) => {
      if (env.matchMediaThrows) throw new Error('boom');
      return {
        matches: q.includes('prefers-color-scheme')
          ? Boolean(env.systemDark)
          : Boolean(env.reducedMotion),
      };
    };
  }
  sandbox.window = sandbox;
  runInNewContext(buildAppearanceBootstrapScript(), sandbox);
  return attrs;
}

describe('buildAppearanceBootstrapScript', () => {
  it('applies a stored dark preference on a themed path', () => {
    expect(run({ stored: { dos_theme: 'dark' }, pathname: '/dashboard' })['data-theme']).toBe('dark');
  });

  it('forces light on a public path regardless of preference', () => {
    expect(run({ stored: { dos_theme: 'dark' }, pathname: '/l/x' })['data-theme']).toBe('light');
  });

  it('resolves System (nothing stored) from the OS: dark', () => {
    expect(run({ pathname: '/dashboard', systemDark: true })['data-theme']).toBe('dark');
  });

  it('resolves stored system from the OS: light', () => {
    expect(
      run({ stored: { dos_theme: 'system' }, pathname: '/dashboard', systemDark: false })['data-theme'],
    ).toBe('light');
  });

  it('treats an unknown stored value as System', () => {
    expect(
      run({ stored: { dos_theme: 'navy' }, pathname: '/dashboard', systemDark: true })['data-theme'],
    ).toBe('dark');
    expect(
      run({ stored: { dos_theme: '' }, pathname: '/dashboard', systemDark: true })['data-theme'],
    ).toBe('dark');
  });

  it('falls back to System when localStorage.getItem throws', () => {
    let attrs: Record<string, string> = {};
    expect(() => {
      attrs = run({ getItemThrows: true, pathname: '/dashboard', systemDark: true });
    }).not.toThrow();
    expect(attrs['data-theme']).toBe('dark');
  });

  it('falls back to light when matchMedia is undefined', () => {
    expect(run({ pathname: '/dashboard', noMatchMedia: true })['data-theme']).toBe('light');
  });

  it('falls back to light when matchMedia throws', () => {
    expect(run({ pathname: '/dashboard', matchMediaThrows: true })['data-theme']).toBe('light');
  });

  it('applies dugout regardless of the OS', () => {
    expect(
      run({ stored: { dos_theme: 'dugout' }, pathname: '/dashboard', systemDark: true })['data-theme'],
    ).toBe('dugout');
  });

  describe('theme-color meta', () => {
    it.each([
      ['dark', '#0f1115'],
      ['dugout', '#08120a'],
      ['light', '#1e3a8a'],
    ])('sets the %s toolbar color', (pref, color) => {
      run({ stored: { dos_theme: pref }, pathname: '/dashboard', systemDark: true });
      expect(lastMetas.map((m) => m.content)).toEqual([color]);
    });

    it('follows the applied theme, not the OS: dark OS on a public path stays navy', () => {
      run({ stored: { dos_theme: 'dark' }, pathname: '/l/x', systemDark: true });
      expect(lastMetas[0].content).toBe('#1e3a8a');
    });

    it('resolves System from the OS', () => {
      run({ pathname: '/dashboard', systemDark: true });
      expect(lastMetas[0].content).toBe('#0f1115');
    });

    it('creates exactly one meta when the page has none', () => {
      run({ stored: { dos_theme: 'dark' }, pathname: '/dashboard' });
      expect(lastMetas.map((m) => m.content)).toEqual(['#0f1115']);
    });

    it('re-colors an existing meta rather than adding another', () => {
      run({ stored: { dos_theme: 'dark' }, pathname: '/dashboard', metas: 1 });
      expect(lastMetas.map((m) => m.content)).toEqual(['#0f1115']);
    });

    it('updates every theme-color meta', () => {
      run({ stored: { dos_theme: 'dugout' }, pathname: '/dashboard', metas: 2 });
      expect(lastMetas.map((m) => m.content)).toEqual(['#08120a', '#08120a']);
    });

    it('still sets data-theme when the DOM has no querySelectorAll', () => {
      const a = run({ stored: { dos_theme: 'dark' }, pathname: '/dashboard', noQuerySelectorAll: true });
      expect(a['data-theme']).toBe('dark');
    });
  });

  describe('density / motion / tone (unchanged behavior)', () => {
    it('uses the existing defaults', () => {
      const a = run({ pathname: '/dashboard' });
      expect(a['data-density']).toBe('comfortable');
      expect(a['data-motion']).toBe('on');
      expect(a['data-tone']).toBe('editorial');
    });

    it('defaults motion to off under reduced motion', () => {
      expect(run({ pathname: '/dashboard', reducedMotion: true })['data-motion']).toBe('off');
    });

    it('honours stored values and ignores invalid ones', () => {
      const a = run({
        pathname: '/dashboard',
        stored: { dos_density: 'compact', dos_motion: 'off', dos_tone: 'bogus' },
      });
      expect(a['data-density']).toBe('compact');
      expect(a['data-motion']).toBe('off');
      expect(a['data-tone']).toBe('editorial');
    });

    it('still sets density/motion/tone when storage throws', () => {
      const a = run({ getItemThrows: true, pathname: '/dashboard' });
      expect(a['data-density']).toBe('comfortable');
      expect(a['data-motion']).toBe('on');
      expect(a['data-tone']).toBe('editorial');
    });
  });
});
