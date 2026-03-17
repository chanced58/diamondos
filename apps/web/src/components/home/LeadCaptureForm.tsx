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

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

export function LeadCaptureForm({
  ctaText = 'Get Early Access',
  primaryColor,
  siteName = 'DiamondOS',
}: LeadCaptureFormProps): JSX.Element {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [state, setState] = useState('');
  const [status, setStatus] = useState<FormStatus>('idle');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      organization: organization.trim(),
      state,
    };

    if (!payload.name || !payload.email || !payload.organization || !payload.state) return;

    setStatus('submitting');

    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      <div className="text-center py-4">
        <p className="text-lg font-semibold text-gray-900">Thanks! We&apos;ll be in touch.</p>
        <p className="text-sm text-gray-400 mt-1">
          We&apos;ll reach out soon about bringing {siteName} to your program.
        </p>
      </div>
    );
  }

  if (status === 'duplicate') {
    return (
      <div className="text-center py-4">
        <p className="text-lg font-semibold text-gray-900">You&apos;re already on the list!</p>
        <p className="text-sm text-gray-400 mt-1">
          We have your info on file. We&apos;ll reach out soon.
        </p>
      </div>
    );
  }

  const buttonStyle = primaryColor ? { backgroundColor: primaryColor } : undefined;
  const buttonClass = primaryColor ? 'hover:opacity-90' : 'bg-brand-700 hover:bg-brand-600';

  const inputClass =
    'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm';

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          required
          className={inputClass}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          required
          className={inputClass}
        />
        <input
          type="text"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          placeholder="School or organization name"
          required
          className={inputClass}
        />
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          required
          className={`${inputClass} ${!state ? 'text-gray-400' : 'text-gray-900'}`}
        >
          <option value="" disabled>State</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <button
          type="submit"
          disabled={status === 'submitting' || !name || !email || !organization || !state}
          className={`w-full px-5 py-2.5 text-sm font-semibold rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm ${buttonClass}`}
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
        We&apos;ll never sell or share your information. It&apos;s only used to keep you updated on {siteName}.
      </p>
    </div>
  );
}
