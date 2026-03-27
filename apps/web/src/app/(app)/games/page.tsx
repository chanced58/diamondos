import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { weAreHome } from '@baseball/shared';
import { CalendarView, CalendarEvent } from './CalendarView';

export const metadata: Metadata = { title: 'Schedule' };

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split('-').map(Number);
    if (y >= 2000 && m >= 1 && m <= 12) return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function toTimeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function toDateKey(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { month?: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);

  const { year, month } = parseMonth(searchParams.month);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let isCoach = false;
  const events: CalendarEvent[] = [];

  if (activeTeam) {
    const rangeStart = new Date(year, month - 1, 1).toISOString();
    const rangeEnd   = new Date(year, month, 1).toISOString();

    const [gamesResult, practicesResult, teamEventsResult] = await Promise.all([
      db
        .from('games')
        .select('id, opponent_name, scheduled_at, location_type, neutral_home_team, status')
        .eq('team_id', activeTeam.id)
        .neq('status', 'cancelled')
        .gte('scheduled_at', rangeStart)
        .lt('scheduled_at', rangeEnd)
        .order('scheduled_at'),
      db
        .from('practices')
        .select('id, scheduled_at, location, status')
        .eq('team_id', activeTeam.id)
        .neq('status', 'cancelled')
        .gte('scheduled_at', rangeStart)
        .lt('scheduled_at', rangeEnd)
        .order('scheduled_at'),
      db
        .from('team_events')
        .select('id, title, event_type, starts_at, location')
        .eq('team_id', activeTeam.id)
        .gte('starts_at', rangeStart)
        .lt('starts_at', rangeEnd)
        .order('starts_at'),
    ]);

    const access = await getUserAccess(activeTeam.id, user.id);
    isCoach = access.isCoach;

    for (const g of gamesResult.data ?? []) {
      const loc = weAreHome(g.location_type, g.neutral_home_team) ? 'vs' : '@';
      events.push({
        id:      g.id,
        type:    'game',
        title:   `${loc} ${g.opponent_name}`,
        dateKey: toDateKey(g.scheduled_at),
        time:    toTimeLabel(g.scheduled_at),
        url:     `/games/${g.id}`,
        detail:  g.status !== 'scheduled' ? g.status.replace('_', ' ') : undefined,
      });
    }

    for (const p of practicesResult.data ?? []) {
      events.push({
        id:      p.id,
        type:    'practice',
        title:   'Practice',
        dateKey: toDateKey(p.scheduled_at),
        time:    toTimeLabel(p.scheduled_at),
        url:     `/practices/${p.id}`,
        detail:  p.location ?? undefined,
      });
    }

    for (const e of teamEventsResult.data ?? []) {
      events.push({
        id:      e.id,
        type:    'event',
        title:   e.title,
        dateKey: toDateKey(e.starts_at),
        time:    toTimeLabel(e.starts_at),
        url:     `/games/events/${e.id}`,
        detail:  e.location ?? undefined,
      });
    }
  }

  return (
    <div className="p-8 max-w-4xl">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          {activeTeam && (
            <p className="text-gray-500 text-sm">{activeTeam.name}</p>
          )}
        </div>
        {isCoach && activeTeam && (
          <div className="flex items-center gap-2">
            <Link
              href="/games/new"
              className="bg-brand-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors text-sm"
            >
              + Add Game
            </Link>
            <Link
              href="/practices/new"
              className="bg-white border border-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              + Practice
            </Link>
            <Link
              href="/games/events/new"
              className="bg-white border border-gray-200 text-gray-700 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              + Event
            </Link>
            <Link
              href="/games/demo/lineup"
              className="text-sm text-brand-700 hover:underline font-medium px-2"
            >
              Practice Scoring
            </Link>
          </div>
        )}
      </div>

      {!activeTeam ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <p className="text-blue-700">
            No team found.{' '}
            <Link href="/admin/create-team" className="underline font-medium">
              Create a team
            </Link>{' '}
            to start scheduling.
          </p>
        </div>
      ) : (
        <CalendarView
          year={year}
          month={month}
          events={events}
          isCoach={isCoach}
          teamId={activeTeam.id}
        />
      )}
    </div>
  );
}
