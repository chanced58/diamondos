'use client';
import type { JSX } from 'react';

import { useState } from 'react';

type Mode = 'form' | 'sent';

export function PlayerSignupForm(): JSX.Element {
  const [mode, setMode] = useState<Mode>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/player-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          handle: handle.toLowerCase().trim(),
          graduationYear: graduationYear ? Number(graduationYear) : undefined,
        }),
      });

      // Tolerate non-JSON error responses (e.g., proxy HTML errors).
      const data = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) {
        setError(data.error ?? 'Unable to create your account.');
        return;
      }
      setMode('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'sent') {
    const normalizedEmail = email.toLowerCase().trim();
    return (
      <div className="text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Check your email</h2>
        <p className="text-gray-500">
          We sent a sign-in link to <strong>{normalizedEmail}</strong>. Click the link to activate your profile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="firstName">
            First name
          </label>
          <input
            id="firstName"
            type="text"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="lastName">
            Last name
          </label>
          <input
            id="lastName"
            type="text"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="handle">
          Profile handle
        </label>
        <div className="flex">
          <span className="inline-flex items-center px-3 text-sm text-gray-500 bg-gray-50 border border-r-0 border-gray-300 rounded-l-lg">
            /p/
          </span>
          <input
            id="handle"
            type="text"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-z0-9_-]+"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="your-handle"
            className="flex-1 border border-gray-300 rounded-r-lg px-3 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          3–32 characters, lowercase letters, numbers, hyphens, or underscores. This is your public URL.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="graduationYear">
          Graduation year <span className="text-gray-400">(optional)</span>
        </label>
        <input
          id="graduationYear"
          type="number"
          min={2000}
          max={2100}
          value={graduationYear}
          onChange={(e) => setGraduationYear(e.target.value)}
          placeholder="2027"
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
        disabled={loading}
        className="w-full bg-brand-700 text-white font-semibold py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Creating profile…' : 'Create my profile'}
      </button>

      <p className="text-xs text-center text-gray-400">
        Free to start. Upgrade to Pro to publish publicly and share with recruiters.
      </p>
    </form>
  );
}
