import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate, formatTime } from '@baseball/shared';
import { CancelGameForm } from './CancelGameForm';
import { StartGameForm } from './StartGameForm';
import { LocationMap } from '@/components/maps/LocationMap';

export const metadata: Metadata = { title: 'Game' };

const STATUS_STYLES: Record<string, { pill: string; label: string }> = {
  scheduled:   { pill: 'bg-blue-50 text-blue-700 border-blue-200',    label: 'Scheduled' },
  in_progress: { pill: 'bg-green-50 text-green-700 border-green-200', label: 'In Progress' },
  completed:   { pill: 'bg-gray-100 text-gray-600 border-gray-200',   label: 'Final' },
  cancelled:   { pill: 'bg-red-50 text-red-700 border-red-200',       label: 'Cancelled' },
  postponed:   { pill: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Postponed' },
};

export default async function GameDetailPage({
  params,
}: {
  params: { gameId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: game } = await db
    .from('games')
    .select('*')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', game.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) notFound();

  const isCoach =
    membership.role === 'head_coach' ||
    membership.role === 'assistant_coach' ||
    membership.role === 'athletic_director';

  const { count: lineupCount } = await db
    .from('game_lineups')
    .select('id', { count: 'exact', head: true })
    .eq('game_id', params.gameId);

  const hasLineup = (lineupCount ?? 0) > 0;

  const statusStyle = STATUS_STYLES[game.status] ?? STATUS_STYLES.scheduled;
  const locationLabel =
    game.location_type === 'home' ? 'Home'
    : game.location_type === 'away' ? 'Away'
    : 'Neutral site';
  const vsAt = game.location_type === 'away' ? '@' : 'vs';
  const isCompleted = game.status === 'completed';

  return (
    <div className="p-8 max-w-2xl">
      {/* ── Back link ──────────────────────────────────────────── */}
      <Link href="/games" className="text-sm text-brand-700 hover:underline">
        ← Back to schedule
      </Link>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mt-4 mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {vsAt} {game.opponent_name}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {formatDate(game.scheduled_at)} · {formatTime(game.scheduled_at)}
            </p>
          </div>
          <span
            className={`shrink-0 text-xs font-semibold px-3 py-1 rounded-full border ${statusStyle.pill}`}
          >
            {statusStyle.label}
          </span>
        </div>
      </div>

      {/* ── Score (completed games) ─────────────────────────────── */}
      {isCompleted && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Final Score
          </p>
          <div className="flex items-center justify-center gap-8">
            <div>
              <p className="text-sm text-gray-500 mb-1">
                {game.location_type === 'home' ? 'Us' : game.opponent_name}
              </p>
              <p className="text-5xl font-bold text-gray-900">
                {game.location_type === 'home' ? game.home_score : game.away_score}
              </p>
            </div>
            <div className="text-2xl text-gray-300 font-light">—</div>
            <div>
              <p className="text-sm text-gray-500 mb-1">
                {game.location_type === 'home' ? game.opponent_name : 'Us'}
              </p>
              <p className="text-5xl font-bold text-gray-900">
                {game.location_type === 'home' ? game.away_score : game.home_score}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Game details ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>
        </div>
        <dl className="divide-y divide-gray-100">
          <div className="flex px-5 py-3 gap-4">
            <dt className="text-sm text-gray-500 w-32 shrink-0">Date</dt>
            <dd className="text-sm font-medium text-gray-900">
              {formatDate(game.scheduled_at)}
            </dd>
          </div>
          <div className="flex px-5 py-3 gap-4">
            <dt className="text-sm text-gray-500 w-32 shrink-0">Time</dt>
            <dd className="text-sm font-medium text-gray-900">
              {formatTime(game.scheduled_at)}
            </dd>
          </div>
          <div className="flex px-5 py-3 gap-4">
            <dt className="text-sm text-gray-500 w-32 shrink-0">Location</dt>
            <dd className="text-sm font-medium text-gray-900">{locationLabel}</dd>
          </div>
          {game.venue_name && (
            <div className="flex px-5 py-3 gap-4">
              <dt className="text-sm text-gray-500 w-32 shrink-0">Venue</dt>
              <dd className="text-sm font-medium text-gray-900">{game.venue_name}</dd>
            </div>
          )}
          {game.notes && (
            <div className="flex px-5 py-3 gap-4">
              <dt className="text-sm text-gray-500 w-32 shrink-0">Notes</dt>
              <dd className="text-sm text-gray-700 leading-relaxed">{game.notes}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── Map ────────────────────────────────────────────────── */}
      {game.latitude && game.longitude && (
        <div className="mb-6">
          <LocationMap
            latitude={game.latitude}
            longitude={game.longitude}
            label={game.venue_name ?? game.opponent_name}
            placeId={game.place_id ?? undefined}
          />
        </div>
      )}

      {/* ── Scoring controls (scheduled — coaches only) ─────────── */}
      {game.status === 'scheduled' && isCoach && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <p className="font-semibold text-gray-900 mb-1">Ready to score this game?</p>
          <p className="text-sm text-gray-500 mb-4">
            Set your lineup, then start the game to begin pitch-by-pitch scoring.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href={`/games/${game.id}/lineup`}
              className="text-sm bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {hasLineup ? 'Edit Lineup' : 'Set Lineup'}
            </Link>
            {hasLineup && <StartGameForm gameId={game.id} />}
          </div>
        </div>
      )}

      {/* ── Scoring controls (in progress) ──────────────────────── */}
      {game.status === 'in_progress' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6">
          <p className="text-sm font-semibold text-green-800 mb-2">Game in progress</p>
          <Link
            href={`/games/${game.id}/score`}
            className="inline-block bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-green-800 transition-colors"
          >
            Continue Scoring →
          </Link>
        </div>
      )}

      {/* ── Danger zone (coaches only) ──────────────────────────── */}
      {isCoach && (
        <div className="mt-4 pt-6 border-t border-gray-200">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Danger Zone
          </p>
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-900">Cancel this game</p>
              <p className="text-xs text-red-600 mt-0.5">
                Marks the game as cancelled. The record is preserved.
              </p>
            </div>
            <CancelGameForm
              gameId={game.id}
              opponentName={game.opponent_name}
              currentStatus={game.status}
            />
          </div>
        </div>
      )}
    </div>
  );
}
