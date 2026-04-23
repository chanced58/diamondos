import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { formatTime, weAreHome } from '@baseball/shared';
import { NewAnnouncementForm } from '../messages/NewAnnouncementForm';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueTeamIds } from '@baseball/database';
import { CardHero } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { Badge } from '@/components/ui/Badge';
import { DiamondField } from '@/components/ui/DiamondField';

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { view?: string };
}): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(supabase, user.id);

  if (!activeTeam) {
    return (
      <div className="page">
        <CardHero style={{ padding: 32 }}>
          <div className="eyebrow" style={{ color: 'var(--turf-200)' }}>Welcome to DiamondOS</div>
          <div className="display" style={{ fontSize: 44, color: 'white', marginTop: 8 }}>
            Let&apos;s build your <em className="display-it" style={{ color: 'var(--turf-200)' }}>team</em>
          </div>
          <p style={{ color: 'rgba(255,255,255,.75)', marginTop: 10, maxWidth: 520 }}>
            Create your team to start managing your roster, scheduling games, and communicating with
            players and parents.
          </p>
          <Link href="/admin/create-team" className="btn btn-turf" style={{ marginTop: 18 }}>
            Create a team
          </Link>
        </CardHero>
      </div>
    );
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const league = await getActiveLeague(activeTeam.id);
  const isLeagueView = searchParams.view === 'league' && league !== null;

  let scopeTeamIds: string[] = [activeTeam.id];
  const teamNameMap: Record<string, string> = {};
  if (isLeagueView && league) {
    const leagueTeamIds = await getLeagueTeamIds(db, league.id);
    if (leagueTeamIds.length > 0) {
      scopeTeamIds = leagueTeamIds;
      const { data: teamsData } = await db
        .from('teams')
        .select('id, name')
        .in('id', scopeTeamIds);
      for (const t of teamsData ?? []) {
        teamNameMap[t.id] = t.name;
      }
    }
  }

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
      .select('id, team_id, opponent_name, scheduled_at, location_type, neutral_home_team, venue_name')
      .in('team_id', scopeTeamIds)
      .in('status', ['scheduled', 'in_progress'])
      .gte('scheduled_at', now)
      .lte('scheduled_at', fourWeeksOut)
      .order('scheduled_at'),
    db.from('practices')
      .select('id, team_id, scheduled_at, location, duration_minutes')
      .eq('team_id', activeTeam.id)
      .not('status', 'eq', 'cancelled')
      .gte('scheduled_at', now)
      .lte('scheduled_at', fourWeeksOut)
      .order('scheduled_at'),
    db.from('team_events')
      .select('id, team_id, title, event_type, starts_at, location')
      .eq('team_id', activeTeam.id)
      .gte('starts_at', now)
      .lte('starts_at', fourWeeksOut)
      .order('starts_at'),
    db.from('games')
      .select('id, team_id, opponent_name, scheduled_at, location_type, neutral_home_team, home_score, away_score, completed_at')
      .in('team_id', scopeTeamIds)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(8),
    db.from('channels')
      .select('id, name')
      .eq('team_id', activeTeam.id)
      .eq('channel_type', 'announcement'),
  ]);

  const { role } = await getUserAccess(activeTeam.id, user.id);
  const canPostAnnouncement = ['head_coach', 'assistant_coach', 'athletic_director'].includes(role ?? '');

  const upcomingItems: UpcomingItem[] = [
    ...(upcomingGamesResult.data ?? []).map((g: any) => {
      const isHome = weAreHome(g.location_type, g.neutral_home_team);
      const locTag = g.location_type === 'home' ? 'Home' : g.location_type === 'away' ? 'Away' : 'Neutral';
      const teamLabel = isLeagueView && g.team_id !== activeTeam.id ? teamNameMap[g.team_id] : null;
      const parts = [teamLabel, locTag, g.venue_name].filter(Boolean);
      return {
        kind: 'game' as const,
        id: g.id,
        date: g.scheduled_at,
        label: `${isHome ? 'vs' : '@'} ${g.opponent_name}`,
        sublabel: parts.join(' · '),
        href: `/games/${g.id}`,
      };
    }),
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

  const recentGames: RecentGame[] = (recentGamesResult.data ?? []).map((g: any) => {
    const isHome = weAreHome(g.location_type, g.neutral_home_team);
    const ourScore   = isHome ? g.home_score : g.away_score;
    const theirScore = isHome ? g.away_score : g.home_score;
    const teamLabel = isLeagueView && g.team_id !== activeTeam.id ? teamNameMap[g.team_id] : null;
    return {
      id: g.id,
      date: g.completed_at ?? g.scheduled_at,
      opponent: teamLabel ? `${teamLabel}: ${g.opponent_name}` : g.opponent_name,
      ourScore,
      theirScore,
      locationLabel: isHome ? 'vs' : '@',
    };
  });

  const wins = recentGames.filter((g) => g.ourScore > g.theirScore).length;
  const losses = recentGames.filter((g) => g.ourScore < g.theirScore).length;
  const record = `${wins}–${losses}`;
  const runsFor = recentGames.reduce((s, g) => s + g.ourScore, 0);
  const runsAgainst = recentGames.reduce((s, g) => s + g.theirScore, 0);

  const announcements: Announcement[] = [];
  const channelIds = (announcementChannelsResult.data ?? []).map((c) => c.id);
  const channelNameMap = Object.fromEntries(
    (announcementChannelsResult.data ?? []).map((c) => [c.id, c.name]),
  );

  if (channelIds.length > 0) {
    const { data: messages } = await db
      .from('messages')
      .select('id, body, created_at, channel_id, sender_id')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(6);

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

  // Build the hero card from the next upcoming game (if any)
  const nextGame = upcomingGamesResult.data?.[0];
  const nextGameIsHome = nextGame ? weAreHome(nextGame.location_type, nextGame.neutral_home_team) : false;
  const vsAt = nextGameIsHome ? 'vs' : '@';

  return (
    <div className="page">
      <div className="between" style={{ marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div className="eyebrow">{isLeagueView && league ? league.name : 'Team dashboard'}</div>
          <h1 className="display" style={{ fontSize: 34, marginTop: 4 }}>{activeTeam.name}</h1>
        </div>
        {league && (
          <div className="seg" style={{ width: 240 }}>
            <Link href="/dashboard" className={!isLeagueView ? 'on' : ''}>
              My Team
            </Link>
            <Link href="/dashboard?view=league" className={isLeagueView ? 'on' : ''}>
              {league.name}
            </Link>
          </div>
        )}
      </div>

      <div className="dashboard-summary-grid">
        {nextGame ? (
          <CardHero style={{ padding: 28 }}>
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--turf-200)' }}>Next up</div>
                <div className="display" style={{ fontSize: 40, color: 'white', marginTop: 6, letterSpacing: '-0.02em' }}>
                  {vsAt}{' '}
                  <em className="display-it" style={{ color: 'var(--turf-200)' }}>{nextGame.opponent_name}</em>
                </div>
                <div style={{ color: 'rgba(255,255,255,.75)', marginTop: 6, fontSize: 13 }}>
                  {new Date(nextGame.scheduled_at).toLocaleString([], {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {nextGame.venue_name && ` · ${nextGame.venue_name}`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <Link href={`/games/${nextGame.id}`} className="btn btn-turf">Start scoring</Link>
                  <Link
                    href={`/games/${nextGame.id}/lineup`}
                    className="btn btn-ghost"
                    style={{
                      color: 'white',
                      borderColor: 'rgba(255,255,255,.2)',
                      background: 'transparent',
                    }}
                  >
                    Set lineup
                  </Link>
                </div>
              </div>
              <DiamondField size={130} variant="editorial" />
            </div>
          </CardHero>
        ) : (
          <CardHero style={{ padding: 28 }}>
            <div className="eyebrow" style={{ color: 'var(--turf-200)' }}>Next up</div>
            <div className="display" style={{ fontSize: 30, color: 'white', marginTop: 6 }}>
              Nothing <em className="display-it" style={{ color: 'var(--turf-200)' }}>scheduled</em>
            </div>
            <p style={{ color: 'rgba(255,255,255,.7)', marginTop: 6, fontSize: 13 }}>
              Add games and practices to see them here.
            </p>
            <Link href="/games/new" className="btn btn-turf" style={{ marginTop: 16 }}>
              Schedule a game
            </Link>
          </CardHero>
        )}

        <StatTile
          label="Recent record"
          value={<span className="mono">{record}</span>}
          delta={`${recentGames.length} game${recentGames.length === 1 ? '' : 's'} tracked`}
        />
        <StatTile
          label="Run diff"
          value={<span className="mono">{runsFor - runsAgainst >= 0 ? '+' : ''}{runsFor - runsAgainst}</span>}
          delta={`${runsFor} RF · ${runsAgainst} RA`}
          trend={runsFor - runsAgainst >= 0 ? 'up' : 'down'}
        />
      </div>

      <div className="dashboard-content-grid">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--app-border)' }}>
            <h2 className="display" style={{ fontSize: 18 }}>Upcoming</h2>
            <Link href="/games" style={{ fontSize: 12, color: 'var(--app-brand-2)', textDecoration: 'none' }}>
              View all →
            </Link>
          </div>
          {upcomingItems.length === 0 ? (
            <p style={{ padding: '18px 20px', color: 'var(--app-fg-muted)', fontSize: 14 }}>
              Nothing scheduled in the next 4 weeks.{' '}
              <Link href="/games/new" style={{ color: 'var(--app-brand-2)' }}>Schedule a game →</Link>
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {upcomingItems.map((item) => {
                const d = new Date(item.date);
                const tones = { game: 'info', practice: 'safe', event: 'clay' } as const;
                const kindLabel = { game: 'Game', practice: 'Practice', event: item.sublabel ?? 'Event' };
                return (
                  <li key={`${item.kind}-${item.id}`} style={{ borderTop: '1px solid var(--app-border)' }}>
                    <Link
                      href={item.href}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '14px 20px',
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'background var(--mo) var(--ease)',
                      }}
                    >
                      <div style={{ width: 44, textAlign: 'center', flexShrink: 0 }}>
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: 'var(--app-fg-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: 0.08,
                          }}
                        >
                          {d.toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                        <div
                          className="display"
                          style={{ fontSize: 22, color: 'var(--app-fg)', letterSpacing: '-0.02em' }}
                        >
                          {d.getDate()}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--app-fg-muted)' }}>
                          {formatTime(item.date)}
                          {item.sublabel && <span> · {item.sublabel}</span>}
                        </div>
                      </div>
                      <Badge tone={tones[item.kind]}>{kindLabel[item.kind]}</Badge>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--app-border)' }}>
            <h2 className="display" style={{ fontSize: 18 }}>Announcements</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {canPostAnnouncement && (announcementChannelsResult.data?.length ?? 0) > 0 && (
                <NewAnnouncementForm
                  teamId={activeTeam.id}
                  channelId={announcementChannelsResult.data![0].id}
                />
              )}
              <Link href="/messages" style={{ fontSize: 12, color: 'var(--app-brand-2)', textDecoration: 'none' }}>
                View all →
              </Link>
            </div>
          </div>
          {announcements.length === 0 ? (
            <p style={{ padding: '18px 20px', color: 'var(--app-fg-muted)', fontSize: 14 }}>
              No recent announcements.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {announcements.map((ann) => (
                <li key={ann.id} style={{ padding: '14px 20px', borderTop: '1px solid var(--app-border)' }}>
                  <div className="between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{ann.senderName}</span>
                    <span style={{ fontSize: 10, color: 'var(--app-fg-subtle)' }}>
                      {new Date(ann.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--app-fg-muted)',
                      lineHeight: 1.5,
                      margin: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {ann.content}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 16 }}>
        <div className="between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--app-border)' }}>
          <h2 className="display" style={{ fontSize: 18 }}>Recent games</h2>
          <Link href="/games" style={{ fontSize: 12, color: 'var(--app-brand-2)', textDecoration: 'none' }}>
            View all →
          </Link>
        </div>
        {recentGames.length === 0 ? (
          <p style={{ padding: '18px 20px', color: 'var(--app-fg-muted)', fontSize: 14 }}>No completed games yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {recentGames.map((g) => {
              const won = g.ourScore > g.theirScore;
              const lost = g.ourScore < g.theirScore;
              const result: 'W' | 'L' | 'T' = won ? 'W' : lost ? 'L' : 'T';
              const tone: 'safe' | 'danger' | 'info' = won ? 'safe' : lost ? 'danger' : 'info';
              const d = new Date(g.date);
              return (
                <li key={g.id} style={{ borderTop: '1px solid var(--app-border)' }}>
                  <Link
                    href={`/games/${g.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      padding: '14px 20px',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <div style={{ width: 44, textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--app-fg-muted)', textTransform: 'uppercase' }}>
                        {d.toLocaleDateString('en-US', { month: 'short' })}
                      </div>
                      <div className="display" style={{ fontSize: 22 }}>{d.getDate()}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {g.locationLabel} {g.opponent}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--app-fg-muted)' }}>Box score →</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span className="mono" style={{ fontWeight: 700 }}>
                        {g.ourScore}–{g.theirScore}
                      </span>
                      <Badge tone={tone}>{result}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
