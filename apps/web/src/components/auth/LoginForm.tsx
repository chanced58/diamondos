'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';

type Mode = 'email' | 'sent';

export function LoginForm(): JSX.Element | null {
  const [mode, setMode] = useState<Mode>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Step 1: Server-side invite-only check
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Unable to verify email');
        setLoading(false);
        return;
      }

      // Step 2: Send OTP from the browser so PKCE code_verifier cookie
      // is stored in the user's browser (required for callback code exchange)
      const supabase = createBrowserClient();
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (otpError) {
        const isRateLimit = otpError.message?.toLowerCase().includes('security purposes');
        setError(
          isRateLimit
            ? 'Please wait 60 seconds before requesting another sign-in link.'
            : otpError.message,
        );
        setLoading(false);
        return;
      }

      setMode('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in link');
    }
    setLoading(false);
  }

  if (mode === 'sent') {
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500">
          We sent a sign-in link to <strong>{email}</strong>. Click the link to sign in.
        </p>
        <button
          className="mt-6 text-sm text-brand-600 hover:underline"
          onClick={() => {
            setMode('email');
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleMagicLink} className="space-y-5">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
          Email address
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="coach@school.edu"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send sign-in link'}
      </button>

      <p className="text-xs text-center text-gray-400">
        Enter your email to receive a one-click sign-in link.
      </p>
    </form>
  );
}
