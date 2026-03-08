'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'login' | 'forgot' | 'magic-sent' | 'reset-sent';

export function LoginForm(): JSX.Element | null {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // ── Password sign-in ──────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/sign-in-with-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Sign in failed');
        setLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed');
      setLoading(false);
    }
  }

  // ── Magic link ────────────────────────────────────────────────────────────
  async function handleMagicLink() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to send magic link');
      } else {
        setMode('magic-sent');
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to send magic link');
    }
    setLoading(false);
  }

  // ── Forgot password ───────────────────────────────────────────────────────
  async function handleSendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/send-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to send reset email');
      } else {
        setMode('reset-sent');
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to send reset email');
    }
    setLoading(false);
  }

  // ── "Check your email" confirmation ──────────────────────────────────────
  if (mode === 'magic-sent' || mode === 'reset-sent') {
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500">
          {mode === 'reset-sent'
            ? <>We sent a password reset link to <strong>{email}</strong>.</>
            : <>We sent a magic link to <strong>{email}</strong>. Click the link to sign in.</>}
        </p>
        <button
          className="mt-6 text-sm text-brand-600 hover:underline"
          onClick={() => {
            setMode('login');
            setError(null);
          }}
        >
          Use a different email
        </button>
      </div>
    );
  }

  // ── Forgot-password mode ──────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <form onSubmit={handleSendResetEmail} className="space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Reset your password</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
          <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">
            Email address
          </label>
          <input
            id="reset-email"
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
          {loading ? 'Sending…' : 'Send reset email'}
        </button>

        <button
          type="button"
          onClick={() => { setMode('login'); setError(null); }}
          className="w-full text-sm text-gray-500 hover:text-gray-700 hover:underline"
        >
          ← Back to sign in
        </button>
      </form>
    );
  }

  // ── Default: login mode ───────────────────────────────────────────────────
  return (
    <form onSubmit={handleSignIn} className="space-y-5">
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

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
        <div className="mt-1 text-right">
          <button
            type="button"
            onClick={() => { setMode('forgot'); setError(null); }}
            className="text-xs text-brand-600 hover:underline"
          >
            Forgot password?
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-gray-400">or</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleMagicLink}
        disabled={loading || !email}
        className="w-full bg-white border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
      >
        Send magic link to email
      </button>

      <p className="text-xs text-center text-gray-400">
        Sign in with your password or receive a one-click link by email.
      </p>
    </form>
  );
}
