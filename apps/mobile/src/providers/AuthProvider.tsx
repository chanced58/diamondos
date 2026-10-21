import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabase';
import { unregisterPushToken } from '../lib/notifications';
import { clearCachedMe } from '../features/teams/me';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SIGN_OUT_CLEANUP_TIMEOUT_MS = 5_000;

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Device cleanup runs first, while the session can still authorize the
  // push-token delete. It is capped so a slow network can't hold the button:
  // a token left undeleted stays stored and the next sign-out retries it.
  const signOut = async () => {
    await Promise.race([
      Promise.all([unregisterPushToken(), clearCachedMe()]),
      new Promise((resolve) => setTimeout(resolve, SIGN_OUT_CLEANUP_TIMEOUT_MS)),
    ]);
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
