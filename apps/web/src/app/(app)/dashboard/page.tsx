import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getTeamsForUser } from '@baseball/database';
import { formatDate, formatTime } from '@baseball/shared';

export const metadata: Metadata = { title: 'Dashboard' };

type ScheduleItem = {
  kind: 'game' | 'practice' | 'event';
  id: string;
  date: string;
  label: string;
  sublabel: string | null;
  badge: string;
  href: string;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  scrimmage: 'Scrimmage',
  travel: 'Travel',
  other: 'Event',
};

export default async function DashboardPage() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const teams = await getTeamsForUser(supabase, user.id);
  const activeTeam = teams?.[0]?.teams as { id: string; name: string } | undefined;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let scheduleItems: ScheduleItem[] = [];
  let rosterCount = 0;

  if (activeTeam) {
    const now = new Date().toISOString();
    const fourWeeksOut = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

    const [gamesResult, practicesResult, eventsResult, playersResult] = await Promise.all([
      db
        .from('games')
        .select('id, opponent_name, scheduled_at, location_type')
        .eq('team_id', activeTeam.id)
        .in('status', ['scheduled', 'in_progress'])
        .gte('scheduled_at', now)
        .lte('scheduled_at', fourWeeksOut)
        .order('scheduled_at'),
      db
        .from('practices')
        .select('id, scheduled_at, location, duration_minutes')
        .eq('team_id', activeTeam.id)
        .not('status', 'eq', 'cancelled')
        .gte('scheduled_at', now)
        .lte('scheduled_at', fourWeeksOut)
        .order('scheduled_at'),
      db
        .from('team_events')
        .select('id, title, event_type, starts_at, location')
        .eq('team_id', activeTeam.id)
        .gte('starts_at', now)
        .lte('starts_at', fourWeeksOut)
        .order('starts_at'),
      db
        .from('players')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', activeTeam.id)
        .eq('is_active', true),
    ]);

    rosterCount = playersResult.count ?? 0;

    const games: ScheduleItem[] = (gamesResult.data ?? []).map((g) => ({
      kind: 'game',
      id: g.id,
      date: g.scheduled_at,
      label: `${g.location_type === 'away' ? '@' : 'vs'} ${g.opponent_name}`,
      sublabel: null,
      badge: g.location_type === 'home' ? 'Home' : g.location_type === 'away' ? 'Away' : 'Neutral',
      href: `/games/${g.id}`,
    }));

    const practices: ScheduleItem[] = (practicesResult.data ?? []).map((p) => ({
      kind: 'practice',
      id: p.id,
      date: p.scheduled_at,
      label: 'Practice',
      sublabel: p.location ?? (p.duration_minutes ? `${p.duration_minutes} min` : null),
      badge: 'Practice',
      href: `/practices/${p.id}`,
    }));

    const teamEvents: ScheduleItem[] = (eventsResult.data ?? []).map((e) => ({
      kind: 'event',
      id: e.id,
      date: e.starts_at,
      label: e.title,
      sublabel: EVENT_TYPE_LABELS[e.event_type] ?? e.event_type,
      badge: EVENT_TYPE_LABELS[e.event_type] ?? 'Event',
      href: `/games/events/${e.id}`,
    }));

    scheduleItems = [...games, ...practices, ...teamEvents].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {activeTeam ? activeTeam.name : 'Welcome'}
      </h1>
      <p className="text-gray-500 mb-8">Here&apos;s what&apos;s happening over the next 4 weeks.</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Upcoming Events"
          value={activeTeam ? String(scheduleItems.length) : '—'}
          description="Next 4 weeks"
        />
        <StatCard
          title="Roster Size"
          value={activeTeam ? String(rosterCount) : '—'}
          description="Active players"
        />

      </div>

      {activeTeam && scheduleItems.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Next 4 Weeks</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {scheduleItems.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={item.href}
                  className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 text-center shrink-0">
                      <p className="text-xs font-semibold text-gray-400 uppercase">
                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short' })}
                      </p>
                      <p className="text-xl font-bold text-gray-900 leading-none">
                        {new Date(item.date).getDate()}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">
                        {formatTime(item.date)}
                        {item.sublabel && ` · ${item.sublabel}`}
                      </p>
                    </div>
                  </div>
                  <BadgePill kind={item.kind} label={item.badge} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!activeTeam && (
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Get started</h2>
          <p className="text-blue-700 mb-4">
            Create your team to start managing your roster, scheduling games, and communicating with
            players and parents.
          </p>
          <Link
            href="/admin/create-team"
            className="inline-block bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-800 transition-colors"
          >
            Create a team
          </Link>
        </div>
      )}

      {activeTeam && scheduleItems.length === 0 && (
        <div className="text-center py-10 text-gray-400">
          <p>Nothing scheduled in the next 4 weeks.</p>
          <Link href="/games" className="text-sm text-brand-700 hover:underline mt-1 inline-block">
            Schedule a game →
          </Link>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm text-gray-400 mt-1">{description}</p>
    </div>
  );
}

function BadgePill({ kind, label }: { kind: 'game' | 'practice' | 'event'; label: string }) {
  const styles = {
    game:     'bg-blue-50 text-blue-700 border-blue-200',
    practice: 'bg-green-50 text-green-700 border-green-200',
    event:    'bg-purple-50 text-purple-700 border-purple-200',
  };
  return (
    <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${styles[kind]}`}>
      {label}
    </span>
  );
}
