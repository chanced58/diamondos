'use client';

import type { JSX } from 'react';
import { useState } from 'react';

type FormStatus = 'idle' | 'submitting' | 'success' | 'duplicate' | 'error';

interface LeadCaptureFormProps {
  ctaText?: string;
  primaryColor?: string;
  secondaryColor?: string;
  siteName?: string;
}

export function LeadCaptureForm({
  ctaText = 'Get Started',
  primaryColor,
  siteName = 'DiamondOS',
}: LeadCaptureFormProps): JSX.Element {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.toLowerCase().trim();
    if (!trimmed) return;

    setStatus('submitting');

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus('error');
        return;
      }

      setStatus(data.duplicate ? 'duplicate' : 'success');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="text-center py-2">
        <p className="text-lg font-semibold text-gray-900">Thanks! We&apos;ll be in touch.</p>
        <p className="text-sm text-gray-400 mt-1">
          We sent a note to our team about your interest.
        </p>
      </div>
    );
  }

  if (status === 'duplicate') {
    return (
      <div className="text-center py-2">
        <p className="text-lg font-semibold text-gray-900">You&apos;re already on the list!</p>
        <p className="text-sm text-gray-400 mt-1">
          We have your email on file. We&apos;ll reach out soon.
        </p>
      </div>
    );
  }

  const buttonStyle = primaryColor
    ? { backgroundColor: primaryColor }
    : undefined;
  const buttonClass = primaryColor
    ? 'hover:opacity-90'
    : 'bg-brand-700 hover:bg-brand-600';

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          required
          className="flex-1 min-w-0 border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
        />
        <button
          type="submit"
          disabled={status === 'submitting' || !email}
          className={`px-5 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm whitespace-nowrap ${buttonClass}`}
          style={buttonStyle}
        >
          {status === 'submitting' ? 'Sending...' : ctaText}
        </button>
      </form>

      {status === 'error' && (
        <p className="text-sm text-red-600 text-center">
          Something went wrong. Please try again.
        </p>
      )}

      <p className="text-xs text-gray-400 text-center">
        We&apos;ll never sell or share your email. It&apos;s only used to keep you updated on {siteName}.
      </p>
    </div>
  );
}
