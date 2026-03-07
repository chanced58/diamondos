import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getTeamsForUser } from '@baseball/database';
import { formatTime } from '@baseball/shared';

export const metadata: Metadata = { title: 'Dashboard' };

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  scrimmage: 'Scrimmage',
  travel: 'Travel',
  other: 'Event',
};

type UpcomingItem = {
  kind: 'game' | 'practice' | 'event';
  id: string;
  date: string;
  label: string;
  sublabel: string | null;
  href: string;
};

type RecentGame = {
  id: string;
  date: string;
  opponent: string;
  ourScore: number;
  theirScore: number;
  locationLabel: string;
};

type Announcement = {
  id: string;
  content: string;
  createdAt: string;
  senderName: string;
  channelName: string | null;
};

export default async function DashboardPage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const teams = await getTeamsForUser(supabase, user.id);
  const activeTeam = teams?.[0]?.teams as { id: string; name: string } | undefined;

  if (!activeTeam) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome</h1>
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-md">
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
      </div>
    );
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date().toISOString();
  const fourWeeksOut = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

  const [
    upcomingGamesResult,
    practicesResult,
    teamEventsResult,
    recentGamesResult,
    announcementChannelsResult,
  ] = await Promise.all([
    db.from('games')
      .select('id, opponent_name, scheduled_at, location_type')
      .eq('team_id', activeTeam.id)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_at', now)
      .lte('scheduled_at', fourWeeksOut)
      .order('scheduled_at'),
    db.from('practices')
      .select('id, scheduled_at, location, duration_minutes')
      .eq('team_id', activeTeam.id)
      .not('status', 'eq', 'cancelled')
      .gte('scheduled_at', now)
      .lte('scheduled_at', fourWeeksOut)
      .order('scheduled_at'),
    db.from('team_events')
      .select('id, title, event_type, starts_at, location')
      .eq('team_id', activeTeam.id)
      .gte('starts_at', now)
      .lte('starts_at', fourWeeksOut)
      .order('starts_at'),
    db.from('games')
      .select('id, opponent_name, scheduled_at, location_type, home_score, away_score, completed_at')
      .eq('team_id', activeTeam.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(8),
    db.from('channels')
      .select('id, name')
      .eq('team_id', activeTeam.id)
      .eq('channel_type', 'announcement'),
  ]);

  // Build upcoming items list
  const upcomingItems: UpcomingItem[] = [
    ...(upcomingGamesResult.data ?? []).map((g) => ({
      kind: 'game' as const,
      id: g.id,
      date: g.scheduled_at,
      label: `${g.location_type === 'away' ? '@' : 'vs'} ${g.opponent_name}`,
      sublabel: g.location_type === 'home' ? 'Home' : g.location_type === 'away' ? 'Away' : 'Neutral',
      href: `/games/${g.id}`,
    })),
    ...(practicesResult.data ?? []).map((p) => ({
      kind: 'practice' as const,
      id: p.id,
      date: p.scheduled_at,
      label: 'Practice',
      sublabel: p.location ?? (p.duration_minutes ? `${p.duration_minutes} min` : null),
      href: `/practices/${p.id}`,
    })),
    ...(teamEventsResult.data ?? []).map((e) => ({
      kind: 'event' as const,
      id: e.id,
      date: e.starts_at,
      label: e.title,
      sublabel: EVENT_TYPE_LABELS[e.event_type] ?? e.event_type,
      href: `/games/events/${e.id}`,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Build recent games list
  const recentGames: RecentGame[] = (recentGamesResult.data ?? []).map((g) => {
    const isHome = g.location_type === 'home';
    const ourScore   = isHome ? g.home_score : g.away_score;
    const theirScore = isHome ? g.away_score : g.home_score;
    return {
      id: g.id,
      date: g.completed_at ?? g.scheduled_at,
      opponent: g.opponent_name,
      ourScore,
      theirScore,
      locationLabel: isHome ? 'vs' : '@',
    };
  });

  // Fetch recent announcements from announcement channels
  const announcements: Announcement[] = [];
  const channelIds = (announcementChannelsResult.data ?? []).map((c) => c.id);
  const channelNameMap = Object.fromEntries(
    (announcementChannelsResult.data ?? []).map((c) => [c.id, c.name]),
  );

  if (channelIds.length > 0) {
    // Fetch messages WITHOUT user_profiles join (avoids PostgREST relationship issues)
    const { data: messages } = await db
      .from('messages')
      .select('id, body, created_at, channel_id, sender_id')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(10);

    // Fetch sender profiles separately
    const senderIds = [...new Set((messages ?? []).map((m) => m.sender_id))];
    const senderMap = new Map<string, { first_name: string; last_name: string }>();
    if (senderIds.length > 0) {
      const { data: profiles } = await db
        .from('user_profiles')
        .select('id, first_name, last_name')
        .in('id', senderIds);
      for (const p of profiles ?? []) {
        senderMap.set(p.id, p);
      }
    }

    for (const msg of messages ?? []) {
      const profile = senderMap.get(msg.sender_id);
      const firstName = profile?.first_name ?? '';
      const lastName  = profile?.last_name  ?? '';
      const senderName = (firstName || lastName)
        ? `${firstName} ${lastName}`.trim()
        : 'Coach';
      announcements.push({
        id: msg.id,
        content: msg.body,
        createdAt: msg.created_at,
        senderName,
        channelName: channelNameMap[msg.channel_id] ?? null,
      });
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{activeTeam.name}</h1>
      <p className="text-gray-500 mb-6">Dashboard</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left column (2/3): Upcoming + Recent Games ─────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Upcoming Events */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Upcoming Events</h2>
              <Link href="/games" className="text-xs text-brand-700 hover:underline">View all →</Link>
            </div>
            {upcomingItems.length === 0 ? (
              <p className="px-6 py-5 text-sm text-gray-400">
                Nothing scheduled in the next 4 weeks.{' '}
                <Link href="/games" className="text-brand-700 hover:underline">Schedule a game →</Link>
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {upcomingItems.map((item) => {
                  const d = new Date(item.date);
                  const kindStyles = {
                    game:     'bg-blue-50 text-blue-700 border-blue-200',
                    practice: 'bg-green-50 text-green-700 border-green-200',
                    event:    'bg-purple-50 text-purple-700 border-purple-200',
                  };
                  const kindLabel = { game: 'Game', practice: 'Practice', event: item.sublabel ?? 'Event' };
                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      <Link href={item.href} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors">
                        <div className="w-10 text-center shrink-0">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase leading-none">
                            {d.toLocaleDateString('en-US', { month: 'short' })}
                          </p>
                          <p className="text-xl font-bold text-gray-900 leading-tight">{d.getDate()}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">{item.label}</p>
                          <p className="text-xs text-gray-500">{formatTime(item.date)}</p>
                        </div>
                        <span className={`shrink-0 text-xs font-medium px-2.5 py-0.5 rounded-full border ${kindStyles[item.kind]}`}>
                          {kindLabel[item.kind]}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Recent Games */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Recent Games</h2>
              <Link href="/games" className="text-xs text-brand-700 hover:underline">View all →</Link>
            </div>
            {recentGames.length === 0 ? (
              <p className="px-6 py-5 text-sm text-gray-400">No completed games yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentGames.map((g) => {
                  const won = g.ourScore > g.theirScore;
                  const lost = g.ourScore < g.theirScore;
                  const result = won ? 'W' : lost ? 'L' : 'T';
                  const resultStyle = won
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : lost
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-gray-50 text-gray-600 border-gray-200';
                  const d = new Date(g.date);
                  return (
                    <li key={g.id}>
                      <Link href={`/games/${g.id}`} className="flex items-center gap-4 px-6 py-3.5 hover:bg-gray-50 transition-colors">
                        <div className="w-10 text-center shrink-0">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase leading-none">
                            {d.toLocaleDateString('en-US', { month: 'short' })}
                          </p>
                          <p className="text-xl font-bold text-gray-900 leading-tight">{d.getDate()}</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {g.locationLabel} {g.opponent}
                          </p>
                          <p className="text-xs text-gray-500">Box score →</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-mono font-semibold text-gray-900 tabular-nums">
                            {g.ourScore}–{g.theirScore}
                          </span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${resultStyle}`}>
                            {result}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* ── Right column (1/3): Announcements ─────────────────── */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Announcements</h2>
              <Link href="/messages" className="text-xs text-brand-700 hover:underline">View all →</Link>
            </div>
            {announcements.length === 0 ? (
              <p className="px-6 py-5 text-sm text-gray-400">No recent announcements.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {announcements.map((ann) => (
                  <li key={ann.id} className="px-6 py-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">{ann.senderName}</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-3">{ann.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
