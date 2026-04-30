'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

export type SidebarState = 'expanded' | 'collapsed';

const STORAGE_KEY = 'dos_sidebar_collapsed';
const DEFAULT_STATE: SidebarState = 'expanded';

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (value: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function applyAttr(state: SidebarState): void {
  document.documentElement.setAttribute('data-sidebar', state);
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function readInitialState(): SidebarState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  return safeRead(STORAGE_KEY) === '1' ? 'collapsed' : 'expanded';
}

export function SidebarProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<SidebarState>(DEFAULT_STATE);

  useEffect(() => {
    const hydrated = readInitialState();
    setState(hydrated);
    applyAttr(hydrated);
  }, []);

  useEffect(() => {
    applyAttr(state);
  }, [state]);

  // Cross-tab sync: when another tab toggles the sidebar, mirror it here.
  useEffect(() => {
    function onStorage(e: StorageEvent): void {
      if (e.key !== STORAGE_KEY) return;
      setState(e.newValue === '1' ? 'collapsed' : 'expanded');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    const next: SidebarState = value ? 'collapsed' : 'expanded';
    setState(next);
    safeWrite(STORAGE_KEY, value ? '1' : '0');
  }, []);

  const toggle = useCallback(() => {
    setState((prev) => {
      const next: SidebarState = prev === 'collapsed' ? 'expanded' : 'collapsed';
      safeWrite(STORAGE_KEY, next === 'collapsed' ? '1' : '0');
      return next;
    });
  }, []);

  const value: SidebarContextValue = {
    collapsed: state === 'collapsed',
    toggle,
    setCollapsed,
  };

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return ctx;
}

// Pre-paint inline script. Reads localStorage and sets data-sidebar on <html>
// before first paint, mirroring AppearanceBootstrap so the server-rendered
// attribute never desyncs from the hydrated state.
export function SidebarBootstrap(): JSX.Element {
  const script = `(function(){try{
    var d=document.documentElement;
    var v=null;try{v=localStorage.getItem('${STORAGE_KEY}');}catch(e){}
    d.setAttribute('data-sidebar', v==='1' ? 'collapsed' : 'expanded');
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
