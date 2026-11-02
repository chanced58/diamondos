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
}

function run(env: Env): Record<string, string> {
  const attrs: Record<string, string> = {};
  const sandbox: Record<string, unknown> = {
    document: {
      documentElement: {
        setAttribute: (k: string, v: string) => {
          attrs[k] = v;
        },
      },
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
