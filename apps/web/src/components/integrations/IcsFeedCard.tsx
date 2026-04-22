'use client';

import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { regenerateIcsToken } from '@/app/(app)/teams/[teamId]/admin/integrations/actions';

interface Props {
  teamId: string;
  feedUrl: string;
  rotatedAt: string | null;
}

export function IcsFeedCard({ teamId, feedUrl, rotatedAt }: Props): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed — select and copy manually.');
    }
  };

  const handleRegenerate = () => {
    const confirmed = window.confirm(
      'Regenerating the URL will invalidate any existing calendar subscriptions. ' +
        'Anyone following the old URL will stop receiving updates until they re-subscribe. Continue?',
    );
    if (!confirmed) return;

    setError(null);
    startTransition(() => {
      regenerateIcsToken(teamId).then((result) => {
        if (!result.ok) setError(result.error);
      });
    });
  };

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">Calendar subscription (ICS)</h3>
          <p className="text-sm text-gray-500 mt-1">
            Share this URL with parents and players so they can subscribe to the team's
            practices and games in Apple Calendar, Google Calendar, or Outlook. The URL
            is private — treat it like a password.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-3">
        <code className="text-xs text-gray-800 break-all">{feedUrl}</code>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700"
        >
          {copied ? 'Copied!' : 'Copy URL'}
        </button>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={pending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {pending ? 'Regenerating…' : 'Regenerate URL'}
        </button>
        {rotatedAt && (
          <span className="text-xs text-gray-500">
            Last rotated {new Date(rotatedAt).toLocaleString()}
          </span>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 mt-3" role="alert">
          {error}
        </p>
      )}

      <p className="text-xs text-gray-500 mt-4 leading-relaxed">
        <strong>Heads up:</strong> regenerating the URL immediately invalidates the
        previous one. Anyone who subscribed with the old URL will need to re-subscribe
        with the new one — their existing subscription will silently stop updating.
      </p>
    </section>
  );
}
