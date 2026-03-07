'use client';
import type { JSX } from 'react';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm(): JSX.Element | null {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDirectLogin() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/direct-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        setLoading(false);
        return;
      }

      // Session cookies are set — redirect to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
      setLoading(false);
    }
  }

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
        setSent(true);
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to send magic link');
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500">
          We sent a magic link to <strong>{email}</strong>. Click the link to sign in.
        </p>
        <button
          className="mt-6 text-sm text-brand-600 hover:underline"
          onClick={() => setSent(false)}
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleDirectLogin();
      }}
      className="space-y-5"
    >
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
        {loading ? 'Signing in...' : 'Sign In'}
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
        Sign in directly or receive a one-click link by email.
      </p>
    </form>
  );
}
