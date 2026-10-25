import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getActiveTeam } from '@/lib/active-team';
import { formatInTimeZone, formatTime, type DashboardUpcomingItem } from '@baseball/shared';
import { NewAnnouncementForm } from '../messages/NewAnnouncementForm';
import type { Database } from '@baseball/database';
import { loadDashboard } from '@/lib/services/dashboard/load-dashboard';
import { fetchGameEventLog } from '@/lib/games/fetch-game-event-log';
import { CardHero } from '@/components/ui/Card';
import { StatTile } from '@/components/ui/StatTile';
import { Badge } from '@/components/ui/Badge';
import { DiamondField } from '@/components/ui/DiamondField';
import { LiveGameCard } from '@/components/dashboard/LiveGameCard';

export const metadata: Metadata = { title: 'Dashboard' };

type GameRow = Database['public']['Tables']['games']['Row'];
type EventRow = Database['public']['Tables']['game_events']['Row'];
type PlayerName = { lastName: string; jerseyNumber: string | number | null };

type UpcomingItem = {
  kind: 'game' | 'practice' | 'event';
  id: string;
  date: string;
  /** Game's zone; null for practices/events and unknown-zone games (host zone). */
  timeZone: string | null;
  label: string;
  sublabel: string | null;
  href: string;
};

type RecentGame = {
  id: string;
  date: string;
  timeZone: string | null;
  opponent: string | null;
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

  const db = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // The same loader the mobile Home tab reads through /api/m/v1.
  const result = await loadDashboard(db, user.id, { teamId: activeTeam.id, view: searchParams.view });
  if (!result.ok) throw new Error(result.error);
  const dashboard = result.data;
  const league = dashboard.league;
  const isLeagueView = dashboard.view === 'league';
  const liveCards = await loadLiveCardData(db, dashboard.liveGames.map((g) => g.id));
  const liveTeamNames = Object.fromEntries(dashboard.liveGames.map((g) => [g.id, g.teamName]));

  const upcomingItems: UpcomingItem[] = dashboard.upcoming.map((item) => ({ ...item, href: upcomingHref(item) }));
  const upcomingGameItems = upcomingItems.filter((i) => i.kind === 'game');
  const upcomingNonGameItems = upcomingItems.filter((i) => i.kind !== 'game');

  const recentGames: RecentGame[] = dashboard.recentGames.map((g) => ({
    id: g.id,
    date: g.date,
    timeZone: g.timeZone,
    opponent: g.opponent,
    ourScore: g.ourScore,
    theirScore: g.theirScore,
    locationLabel: g.isHome ? 'vs' : '@',
  }));

  const { wins, losses, runsFor, runsAgainst } = dashboard.record;
  const record = `${wins}–${losses}`;
  const announcements: Announcement[] = dashboard.announcements.map((a) => ({
    id: a.id,
    content: a.body,
    createdAt: a.createdAt,
    senderName: a.senderName,
    channelName: a.channelName,
  }));
  const announcementChannelId = dashboard.announcementChannelId;

  // Build the hero card from the next upcoming game (if any)
  const nextGame = dashboard.nextGame;
  const vsAt = nextGame?.isHome ? 'vs' : '@';

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

      {liveCards.length > 0 && (
        <section
          style={{
            display: 'grid',
            gap: 'var(--gap-md)',
            marginBottom: 20,
          }}
        >
          <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 className="display" style={{ fontSize: 22 }}>
              Live <em className="display-it" style={{ color: 'var(--turf-500)' }}>now</em>
            </h2>
            <span className="eyebrow" style={{ color: 'var(--app-fg-muted)' }}>
              {liveCards.length} game{liveCards.length === 1 ? '' : 's'} in progress
            </span>
          </div>
          {liveCards.map(({ game, events, playerNameMap }) => (
            <LiveGameCard
              key={game.id}
              game={game}
              initialEvents={events}
              teamName={liveTeamNames[game.id] ?? activeTeam.name}
              playerNameMap={playerNameMap}
            />
          ))}
        </section>
      )}

      <div className="dashboard-summary-grid">
        {nextGame ? (
          <CardHero style={{ padding: 28 }}>
            <div className="between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--turf-200)' }}>Next up</div>
                <div className="display" style={{ fontSize: 40, color: 'white', marginTop: 6, letterSpacing: '-0.02em' }}>
                  {vsAt}{' '}
                  <em className="display-it" style={{ color: 'var(--turf-200)' }}>{nextGame.opponentName}</em>
                </div>
                <div style={{ color: 'rgba(255,255,255,.75)', marginTop: 6, fontSize: 13 }}>
                  {formatInTimeZone(nextGame.scheduledAt, nextGame.timeZone, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {nextGame.venueName && ` · ${nextGame.venueName}`}
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
        <div style={{ display: 'grid', gap: 'var(--gap-md)', minWidth: 0 }}>
          <UpcomingListCard
            title="Upcoming Games"
            items={upcomingGameItems}
            emptyText="No games scheduled in the next 4 weeks."
            emptyLink={{ href: '/games/new', text: 'Schedule a game →' }}
            viewAllHref="/games"
          />
          <UpcomingListCard
            title="Practices & Events"
            items={upcomingNonGameItems}
            emptyText="No practices or events scheduled."
            emptyLink={null}
            viewAllHref="/practices"
          />
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--app-border)' }}>
            <h2 className="display" style={{ fontSize: 18 }}>Announcements</h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {announcementChannelId && (
                <NewAnnouncementForm teamId={activeTeam.id} channelId={announcementChannelId} />
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
                        {formatInTimeZone(g.date, g.timeZone, { month: 'short' })}
                      </div>
                      <div className="display" style={{ fontSize: 22 }}>{formatInTimeZone(g.date, g.timeZone, { day: 'numeric' })}</div>
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

/** Where an upcoming item opens on the web. */
function upcomingHref(item: DashboardUpcomingItem): string {
  if (item.kind === 'game') return `/games/${item.id}`;
  if (item.kind === 'practice') return `/practices/${item.id}`;
  return `/games/events/${item.id}`;
}

type LiveCardData = { game: GameRow; events: EventRow[]; playerNameMap: Record<string, PlayerName> };

/**
 * What the web's realtime live cards start from: each live game's row, its
 * whole event log (paged, so a long game isn't cut off) and the names of both
 * rosters. The dashboard service has already picked which games are live for
 * the viewer; a failed read fails the page rather than showing a card without
 * its log or names.
 */
async function loadLiveCardData(
  db: ReturnType<typeof createClient<Database>>,
  liveGameIds: string[],
): Promise<LiveCardData[]> {
  if (liveGameIds.length === 0) return [];
  const { data: gameRows, error: gamesError } = await db.from('games').select('*').in('id', liveGameIds);
  if (gamesError) throw gamesError;
  const games = (gameRows ?? []) as GameRow[];
  const teamIds = [...new Set(games.map((g) => g.team_id))];
  const opponentTeamIds = [...new Set(games.map((g) => g.opponent_team_id).filter((id): id is string => id != null))];

  const [logs, teamPlayers, opponentPlayers] = await Promise.all([
    Promise.all(liveGameIds.map((id) => fetchGameEventLog(db as never, id))),
    db.from('players').select('id, last_name, jersey_number').in('team_id', teamIds),
    opponentTeamIds.length > 0
      ? db.from('opponent_players').select('id, last_name, jersey_number').in('opponent_team_id', opponentTeamIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamPlayers.error) throw teamPlayers.error;
  if (opponentPlayers.error) throw opponentPlayers.error;
  const eventsByGame = new Map<string, EventRow[]>();
  logs.forEach((log, index) => {
    if (log.error) throw new Error(`events for live game ${liveGameIds[index]}: ${log.error.message}`);
    eventsByGame.set(liveGameIds[index], log.data as unknown as EventRow[]);
  });

  const playerNameMap: Record<string, PlayerName> = {};
  for (const p of [...(teamPlayers.data ?? []), ...(opponentPlayers.data ?? [])] as Array<{
    id: string;
    last_name: string;
    jersey_number: string | number | null;
  }>) {
    playerNameMap[p.id] = { lastName: p.last_name, jerseyNumber: p.jersey_number };
  }
  // In the dashboard's order (oldest start first).
  return liveGameIds
    .map((id) => games.find((g) => g.id === id))
    .filter((game): game is GameRow => game !== undefined)
    .map((game) => ({ game, events: eventsByGame.get(game.id) ?? [], playerNameMap }));
}

function UpcomingListCard({
  title,
  items,
  emptyText,
  emptyLink,
  viewAllHref,
}: {
  title: string;
  items: UpcomingItem[];
  emptyText: string;
  emptyLink: { href: string; text: string } | null;
  viewAllHref: string;
}): JSX.Element {
  const tones = { game: 'info', practice: 'safe', event: 'clay' } as const;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--app-border)' }}>
        <h2 className="display" style={{ fontSize: 18 }}>{title}</h2>
        <Link href={viewAllHref} style={{ fontSize: 12, color: 'var(--app-brand-2)', textDecoration: 'none' }}>
          View all →
        </Link>
      </div>
      {items.length === 0 ? (
        <p style={{ padding: '18px 20px', color: 'var(--app-fg-muted)', fontSize: 14 }}>
          {emptyText}
          {emptyLink && (
            <>
              {' '}
              <Link href={emptyLink.href} style={{ color: 'var(--app-brand-2)' }}>{emptyLink.text}</Link>
            </>
          )}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item) => {
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
                      {formatInTimeZone(item.date, item.timeZone, { month: 'short' })}
                    </div>
                    <div
                      className="display"
                      style={{ fontSize: 22, color: 'var(--app-fg)', letterSpacing: '-0.02em' }}
                    >
                      {formatInTimeZone(item.date, item.timeZone, { day: 'numeric' })}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--app-fg-muted)' }}>
                      {formatTime(item.date, item.timeZone)}
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
  );
}
