import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate, formatTime } from '@baseball/shared';
import { DeleteEventForm } from './DeleteEventForm';
import { LocationMap } from '@/components/maps/LocationMap';

export const metadata: Metadata = { title: 'Team Event' };

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting:   'Team Meeting',
  scrimmage: 'Scrimmage',
  travel:    'Travel',
  other:     'Event',
};

export default async function TeamEventDetailPage({
  params,
}: {
  params: { eventId: string };
}) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: event } = await db
    .from('team_events')
    .select('*')
    .eq('id', params.eventId)
    .single();

  if (!event) notFound();

  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', event.team_id)
    .eq('user_id', user.id)
    .single();

  if (!membership) notFound();

  const isCoach =
    membership.role === 'head_coach' ||
    membership.role === 'assistant_coach' ||
    membership.role === 'athletic_director';

  const typeLabel = EVENT_TYPE_LABELS[event.event_type] ?? 'Event';

  return (
    <div className="p-8 max-w-2xl">
      {/* ── Back link ──────────────────────────────────────────── */}
      <Link href="/games" className="text-sm text-brand-700 hover:underline">
        ← Back to schedule
      </Link>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mt-4 mb-8 flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-2xl shrink-0">
          📅
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-0.5 rounded-full">
              {typeLabel}
            </span>
            <span className="text-sm text-gray-500">
              {formatDate(event.starts_at)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Event details ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700">Details</h2>
        </div>
        <dl className="divide-y divide-gray-100">
          <div className="flex px-5 py-3 gap-4">
            <dt className="text-sm text-gray-500 w-32 shrink-0">Start</dt>
            <dd className="text-sm font-medium text-gray-900">
              {formatDate(event.starts_at)} · {formatTime(event.starts_at)}
            </dd>
          </div>
          {event.ends_at && (
            <div className="flex px-5 py-3 gap-4">
              <dt className="text-sm text-gray-500 w-32 shrink-0">End</dt>
              <dd className="text-sm font-medium text-gray-900">
                {formatDate(event.ends_at)} · {formatTime(event.ends_at)}
              </dd>
            </div>
          )}
          {event.location && (
            <div className="flex px-5 py-3 gap-4">
              <dt className="text-sm text-gray-500 w-32 shrink-0">Location</dt>
              <dd className="text-sm font-medium text-gray-900">{event.location}</dd>
            </div>
          )}
          {event.description && (
            <div className="flex px-5 py-3 gap-4">
              <dt className="text-sm text-gray-500 w-32 shrink-0">Description</dt>
              <dd className="text-sm text-gray-700 leading-relaxed">{event.description}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* ── Map ────────────────────────────────────────────────── */}
      {event.latitude && event.longitude && (
        <div className="mb-6">
          <LocationMap
            latitude={event.latitude}
            longitude={event.longitude}
            label={event.location ?? event.title}
            placeId={event.place_id ?? undefined}
          />
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
              <p className="text-sm font-medium text-red-900">Delete this event</p>
              <p className="text-xs text-red-600 mt-0.5">
                This permanently removes the event from the schedule.
              </p>
            </div>
            <DeleteEventForm eventId={event.id} title={event.title} />
          </div>
        </div>
      )}
    </div>
  );
}
