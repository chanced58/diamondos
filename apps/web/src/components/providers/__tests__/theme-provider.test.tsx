/** @jest-environment jsdom */
import { act, render } from '@testing-library/react';
import { useLayoutEffect, type ReactElement, type ReactNode } from 'react';
import { ThemeProvider, useAppearance } from '../ThemeProvider';

let mockPathname = '/dashboard';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

type Listener = (e: { matches: boolean }) => void;

interface FakeMql {
  matches: boolean;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
}

let darkMql: FakeMql;
let listeners: Listener[];

function installMatchMedia(systemDark: boolean): void {
  listeners = [];
  darkMql = {
    matches: systemDark,
    addEventListener: jest.fn((_t: string, l: Listener) => {
      listeners.push(l);
    }),
    removeEventListener: jest.fn((_t: string, l: Listener) => {
      listeners = listeners.filter((x) => x !== l);
    }),
  };
  window.matchMedia = jest.fn((q: string) =>
    q.includes('prefers-color-scheme')
      ? (darkMql as unknown as MediaQueryList)
      : ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() } as unknown as MediaQueryList),
  ) as unknown as typeof window.matchMedia;
}

function fireSystemChange(matches: boolean): void {
  darkMql.matches = matches;
  act(() => {
    listeners.forEach((l) => l({ matches }));
  });
}

type Ctx = ReturnType<typeof useAppearance>;
let ctx: Ctx;

function Probe(): ReactElement | null {
  ctx = useAppearance();
  return null;
}

function mount(): ReturnType<typeof render> {
  return render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

const htmlTheme = (): string | null => document.documentElement.getAttribute('data-theme');

const themeColor = (): string | null =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;

beforeEach(() => {
  mockPathname = '/dashboard';
  localStorage.clear();
  document.documentElement.setAttribute('data-theme', 'light');
  document.head.innerHTML = '<meta name="theme-color" content="#1e3a8a">';
  installMatchMedia(false);
});

describe('ThemeProvider', () => {
  it('updates <html data-theme> in the layout phase, before passive effects (pre-paint)', () => {
    localStorage.setItem('dos_theme', 'dark');
    const seen: Array<string | null> = [];
    // Parent of ThemeProvider: its layout effect runs after the provider's layout
    // effects but before any passive effect, so it observes the pre-paint state.
    function Outer({ children }: { children: ReactNode }): ReactElement {
      useLayoutEffect(() => {
        seen.push(htmlTheme());
      });
      return <ThemeProvider>{children}</ThemeProvider>;
    }
    const view = render(
      <Outer>
        <Probe />
      </Outer>,
    );
    expect(htmlTheme()).toBe('dark');
    seen.length = 0;

    // Outer re-renders with the new pathname; its layout effect must already see light.
    mockPathname = '/l/x';
    view.rerender(
      <Outer>
        <Probe />
      </Outer>,
    );
    expect(seen).toEqual(['light']);
  });

  it('re-applies on pathname change: dark app page to light public page', () => {
    localStorage.setItem('dos_theme', 'dark');
    const view = mount();
    expect(htmlTheme()).toBe('dark');
    expect(ctx.appliedTheme).toBe('dark');

    mockPathname = '/l/x';
    view.rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(htmlTheme()).toBe('light');
    expect(ctx.appliedTheme).toBe('light');
    expect(ctx.themePreference).toBe('dark');

    mockPathname = '/dashboard';
    view.rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(htmlTheme()).toBe('dark');
  });

  it('follows OS changes live while preference is system', () => {
    mount();
    expect(ctx.themePreference).toBe('system');
    expect(htmlTheme()).toBe('light');
    fireSystemChange(true);
    expect(htmlTheme()).toBe('dark');
    expect(ctx.appliedTheme).toBe('dark');
    fireSystemChange(false);
    expect(htmlTheme()).toBe('light');
  });

  it('starts from the OS theme without a light flash when system is dark', () => {
    installMatchMedia(true);
    mount();
    expect(htmlTheme()).toBe('dark');
  });

  it('ignores OS changes under an explicit light preference', () => {
    localStorage.setItem('dos_theme', 'light');
    mount();
    expect(listeners).toHaveLength(0);
    fireSystemChange(true);
    expect(htmlTheme()).toBe('light');
    expect(ctx.appliedTheme).toBe('light');
  });

  it('unsubscribes from OS changes when leaving system', () => {
    mount();
    expect(listeners).toHaveLength(1);
    act(() => ctx.setThemePreference('dark'));
    expect(darkMql.removeEventListener).toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
    expect(htmlTheme()).toBe('dark');
  });

  it('persists setThemePreference to localStorage.dos_theme', () => {
    mount();
    act(() => ctx.setThemePreference('dugout'));
    expect(localStorage.getItem('dos_theme')).toBe('dugout');
    expect(htmlTheme()).toBe('dugout');
    expect(ctx.themePreference).toBe('dugout');
  });

  it('falls back to system for a corrupt stored value', () => {
    localStorage.setItem('dos_theme', 'navy');
    installMatchMedia(true);
    mount();
    expect(ctx.themePreference).toBe('system');
    expect(htmlTheme()).toBe('dark');
  });

  it('keeps density, motion and tone behavior', () => {
    localStorage.setItem('dos_density', 'compact');
    mount();
    expect(ctx.density).toBe('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
    act(() => ctx.setTone('energetic'));
    expect(localStorage.getItem('dos_tone')).toBe('energetic');
    expect(document.documentElement.getAttribute('data-tone')).toBe('energetic');
  });
});

describe('ThemeProvider printing', () => {
  const fire = (type: 'beforeprint' | 'afterprint'): void => {
    act(() => {
      window.dispatchEvent(new Event(type));
    });
  };

  it('forces Light on beforeprint and restores the applied theme on afterprint', () => {
    localStorage.setItem('dos_theme', 'dark');
    mount();
    expect(htmlTheme()).toBe('dark');
    fire('beforeprint');
    expect(htmlTheme()).toBe('light');
    fire('afterprint');
    expect(htmlTheme()).toBe('dark');
  });

  it('restores dugout, and Light stays Light, around a print', () => {
    localStorage.setItem('dos_theme', 'dugout');
    mount();
    fire('beforeprint');
    expect(htmlTheme()).toBe('light');
    fire('afterprint');
    expect(htmlTheme()).toBe('dugout');

    act(() => ctx.setThemePreference('light'));
    fire('beforeprint');
    expect(htmlTheme()).toBe('light');
    fire('afterprint');
    expect(htmlTheme()).toBe('light');
  });

  it('restores the theme resolved at afterprint when the preference changed during the print', () => {
    localStorage.setItem('dos_theme', 'dark');
    mount();
    fire('beforeprint');
    act(() => ctx.setThemePreference('dugout'));
    expect(htmlTheme()).toBe('light');
    fire('afterprint');
    expect(htmlTheme()).toBe('dugout');
  });

  it('does not touch the theme-color meta while printing', () => {
    localStorage.setItem('dos_theme', 'dark');
    mount();
    expect(themeColor()).toBe('#0f1115');
    fire('beforeprint');
    expect(themeColor()).toBe('#0f1115');
    fire('afterprint');
    expect(themeColor()).toBe('#0f1115');
  });

  it('removes its print listeners on unmount', () => {
    localStorage.setItem('dos_theme', 'dark');
    const view = mount();
    view.unmount();
    document.documentElement.setAttribute('data-theme', 'dark');
    window.dispatchEvent(new Event('beforeprint'));
    expect(htmlTheme()).toBe('dark');
  });
});

describe('ThemeProvider theme-color meta', () => {
  it.each([
    ['dark', '#0f1115'],
    ['dugout', '#08120a'],
    ['light', '#1e3a8a'],
  ])('sets the toolbar color for %s', (pref, color) => {
    localStorage.setItem('dos_theme', pref);
    mount();
    expect(themeColor()).toBe(color);
  });

  it('follows the applied theme across navigation: dark OS, public page stays navy', () => {
    installMatchMedia(true);
    const view = mount();
    expect(themeColor()).toBe('#0f1115');
    mockPathname = '/l/x';
    view.rerender(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(themeColor()).toBe('#1e3a8a');
  });

  it('follows OS changes live under System', () => {
    mount();
    expect(themeColor()).toBe('#1e3a8a');
    fireSystemChange(true);
    expect(themeColor()).toBe('#0f1115');
  });

  it('does nothing when the page has no theme-color meta', () => {
    document.head.innerHTML = '';
    localStorage.setItem('dos_theme', 'dark');
    expect(() => mount()).not.toThrow();
    expect(htmlTheme()).toBe('dark');
  });
});
