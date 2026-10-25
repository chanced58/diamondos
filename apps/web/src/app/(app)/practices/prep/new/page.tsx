import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { formatInTimeZone } from '@baseball/shared';
import { loadPrepPreview } from '@/lib/services/practices/prep-practice';
import { PrepPreviewForm } from './PrepPreviewForm';

export const metadata: Metadata = { title: 'Prep for next game' };

interface PageProps {
  searchParams: Promise<{ duration?: string; sourceGameId?: string }>;
}

const DEFAULT_DURATION = 90;

/** Prep for next game: the suggested plan from `loadPrepPreview` (shared with the mobile app), to review and save. */
export default async function PrepNewPage({ searchParams }: PageProps): Promise<JSX.Element | null> {
  const sp = await searchParams;
  const durationMinutes = sp?.duration ? Math.max(30, Math.min(180, parseInt(sp.duration, 10) || DEFAULT_DURATION)) : DEFAULT_DURATION;
  const sourceGameId = sp?.sourceGameId ?? null;

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) {
    return (
      <div className="p-8">
        <p className="text-gray-500">
          No team found.{' '}
          <Link href="/admin/create-team" className="text-brand-700 hover:underline">
            Create a team
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await loadPrepPreview(db, user.id, { teamId: activeTeam.id, durationMinutes, sourceGameId });
  if (!result.ok) {
    return (
      <div className="p-8 text-gray-500">
        {result.code === 'forbidden' ? 'Only coaches can generate prep practices.' : result.error}
      </div>
    );
  }

  const preview = result.data;
  const nextGame = preview.nextGame;
  if (!nextGame) {
    return (
      <div className="p-8 max-w-xl">
        <Link href="/practices" className="text-sm text-brand-700 hover:underline">
          ← Back to practices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-2">No upcoming game</h1>
        <p className="text-gray-500 text-sm">
          Add a scheduled game from the Games screen first, then come back here to generate a prep practice.
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/practices" className="text-sm text-brand-700 hover:underline">
          ← Back to practices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Prep for next game</h1>
        <p className="text-gray-500 text-sm mt-1">
          {activeTeam.name} vs{' '}
          <strong className="text-gray-900">{nextGame.opponentName}</strong> ·{' '}
          {formatInTimeZone(nextGame.scheduledAt, nextGame.timeZone ?? undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-amber-900 mb-1">Focus</h2>
        <p className="text-sm text-amber-900/90">{preview.focusSummary}</p>
        {preview.hasGaps && (
          <p className="mt-2 text-xs text-amber-800/80">
            Some target weaknesses have no matching drill in your library — tag drills with those deficits to improve future generations.
          </p>
        )}
      </div>

      <PrepPreviewForm
        teamId={activeTeam.id}
        linkedGameId={nextGame.id}
        scheduledAt={computeDefaultScheduledAt(nextGame.scheduledAt, new Date())}
        durationMinutes={preview.durationMinutes}
        focusSummary={preview.focusSummary}
        blocks={preview.blocks}
        drillsById={preview.drillsById}
        weaknessLabels={preview.weaknessLabels}
        tendencyLabels={preview.tendencyLabels}
      />
    </div>
  );
}

/**
 * Default the practice to 48 hours before the next game at 3pm, or tomorrow
 * at 3pm if that is already past. The form lets the coach change it.
 */
function computeDefaultScheduledAt(gameIso: string, now: Date): string {
  const target = new Date(new Date(gameIso).getTime() - 2 * 24 * 3600 * 1000);
  target.setHours(15, 0, 0, 0);
  if (target.getTime() < now.getTime()) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0);
    return tomorrow.toISOString();
  }
  return target.toISOString();
}
