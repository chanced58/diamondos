import type { SupabaseClient } from '@supabase/supabase-js';
import {
  COACH_ROLES,
  dashboardInputSchema,
  deriveGameState,
  filterResetAndReverted,
  weAreHome,
  type DashboardAnnouncement,
  type DashboardLiveGame,
  type DashboardRecentGame,
  type DashboardResponse,
  type DashboardUpcomingItem,
  type EventType,
  type GameEvent,
} from '@baseball/shared';
import { getLeagueForTeam, getLeagueTeamIds } from '@baseball/database';
import { fetchGameEventLog } from '@/lib/games/fetch-game-event-log';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';

/**
 * The team dashboard (the web /dashboard page and the mobile Home tab): live
 * games with their replayed score, the next game, the next four weeks of games,
 * practices and events, the last eight results and the latest announcements.
 * Read with the service role for any member of the team, as the web page does;
 * the league view widens games to every active team in the team's league.
 */

const FOUR_WEEKS_MS = 28 * 24 * 60 * 60 * 1000;
const RECENT_GAMES = 8;
const ANNOUNCEMENTS = 6;

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  scrimmage: 'Scrimmage',
  travel: 'Travel',
  other: 'Event',
};

type LocationType = Parameters<typeof weAreHome>[0];
type NeutralHomeTeam = Parameters<typeof weAreHome>[1];

type UpcomingGameRow = {
  id: string;
  team_id: string;
  opponent_name: string | null;
  scheduled_at: string;
  time_zone: string | null;
  location_type: LocationType;
  neutral_home_team: NeutralHomeTeam;
  venue_name: string | null;
};
type LiveGameRow = { id: string; team_id: string; opponent_name: string | null; location_type: LocationType; neutral_home_team: NeutralHomeTeam };
type RecentGameRow = UpcomingGameRow & { home_score: number | null; away_score: number | null; completed_at: string | null };

export async function loadDashboard(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<DashboardResponse>> {
  const parsed = dashboardInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Team not found.');

  try {
    const [{ data: team, error: teamError }, league] = await Promise.all([
      db.from('teams').select('name').eq('id', teamId).maybeSingle(),
      getLeagueForTeam(db as never, teamId),
    ]);
    if (teamError) throw teamError;
    if (!team) return serviceError('not_found', 'Team not found.');

    const view = parsed.data.view === 'league' && league ? 'league' : 'team';
    const teamNames: Record<string, string> = { [teamId]: team.name as string };
    const scopeTeamIds = view === 'league' ? await leagueScope(db, league!.id, teamId, teamNames) : [teamId];

    const [schedule, liveGames, recentGames, announcements] = await Promise.all([
      loadUpcoming(db, teamId, scopeTeamIds, view, teamNames),
      loadLiveGames(db, scopeTeamIds, teamNames),
      loadRecentGames(db, teamId, scopeTeamIds, view, teamNames),
      loadAnnouncements(db, teamId),
    ]);

    const canPost = viewer.role !== null && (COACH_ROLES as readonly string[]).includes(viewer.role);
    return serviceOk({
      teamId,
      teamName: team.name as string,
      league: league ? { id: league.id, name: league.name } : null,
      view,
      liveGames,
      nextGame: schedule.nextGame,
      upcoming: schedule.upcoming,
      recentGames,
      record: recordOf(recentGames),
      announcements: announcements.items,
      announcementChannelId: canPost ? announcements.firstChannelId : null,
    });
  } catch (error) {
    console.error(`[loadDashboard] team=${teamId} actor=${actorUserId} failed:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
}

/** Every active team in the league (falling back to ours alone), filling in their names. */
async function leagueScope(db: SupabaseClient, leagueId: string, teamId: string, teamNames: Record<string, string>): Promise<string[]> {
  const leagueTeamIds = await getLeagueTeamIds(db as never, leagueId);
  if (leagueTeamIds.length === 0) return [teamId];
  const { data, error } = await db.from('teams').select('id, name').in('id', leagueTeamIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ id: string; name: string }>) teamNames[row.id] = row.name;
  return leagueTeamIds;
}

/** The next four weeks: the scope's scheduled games, and the team's own practices and events, soonest first. */
async function loadUpcoming(
  db: SupabaseClient,
  teamId: string,
  scopeTeamIds: string[],
  view: 'team' | 'league',
  teamNames: Record<string, string>,
): Promise<{ upcoming: DashboardUpcomingItem[]; nextGame: DashboardResponse['nextGame'] }> {
  const now = new Date().toISOString();
  const fourWeeksOut = new Date(Date.now() + FOUR_WEEKS_MS).toISOString();
  const [games, practices, events] = await Promise.all([
    db.from('games')
      .select('id, team_id, opponent_name, scheduled_at, time_zone, location_type, neutral_home_team, venue_name')
      .in('team_id', scopeTeamIds)
      .eq('status', 'scheduled')
      .gte('scheduled_at', now)
      .lte('scheduled_at', fourWeeksOut)
      .order('scheduled_at'),
    db.from('practices')
      .select('id, scheduled_at, location, duration_minutes')
      .eq('team_id', teamId)
      .neq('status', 'cancelled')
      .gte('scheduled_at', now)
      .lte('scheduled_at', fourWeeksOut)
      .order('scheduled_at'),
    db.from('team_events')
      .select('id, title, event_type, starts_at')
      .eq('team_id', teamId)
      .gte('starts_at', now)
      .lte('starts_at', fourWeeksOut)
      .order('starts_at'),
  ]);
  for (const result of [games, practices, events]) if (result.error) throw result.error;

  const gameRows = (games.data ?? []) as UpcomingGameRow[];
  const upcoming: DashboardUpcomingItem[] = [
    ...gameRows.map((g) => {
      const locTag = g.location_type === 'home' ? 'Home' : g.location_type === 'away' ? 'Away' : 'Neutral';
      const teamLabel = view === 'league' && g.team_id !== teamId ? teamNames[g.team_id] : null;
      return {
        kind: 'game' as const,
        id: g.id,
        date: g.scheduled_at,
        timeZone: g.time_zone,
        label: `${weAreHome(g.location_type, g.neutral_home_team) ? 'vs' : '@'} ${g.opponent_name ?? 'TBD'}`,
        sublabel: [teamLabel, locTag, g.venue_name].filter(Boolean).join(' · ') || null,
      };
    }),
    ...((practices.data ?? []) as Array<{ id: string; scheduled_at: string; location: string | null; duration_minutes: number | null }>).map((p) => ({
      kind: 'practice' as const,
      id: p.id,
      date: p.scheduled_at,
      timeZone: null,
      label: 'Practice',
      sublabel: p.location ?? (p.duration_minutes ? `${p.duration_minutes} min` : null),
    })),
    ...((events.data ?? []) as Array<{ id: string; title: string; event_type: string; starts_at: string }>).map((e) => ({
      kind: 'event' as const,
      id: e.id,
      date: e.starts_at,
      timeZone: null,
      label: e.title,
      sublabel: EVENT_TYPE_LABELS[e.event_type] ?? e.event_type,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const next = gameRows[0];
  return {
    upcoming,
    nextGame: next
      ? {
          id: next.id,
          teamId: next.team_id,
          opponentName: next.opponent_name,
          isHome: weAreHome(next.location_type, next.neutral_home_team),
          scheduledAt: next.scheduled_at,
          timeZone: next.time_zone,
          venueName: next.venue_name,
        }
      : null,
  };
}

/** Games in progress, each with the score and inning replayed from its event log. */
async function loadLiveGames(db: SupabaseClient, scopeTeamIds: string[], teamNames: Record<string, string>): Promise<DashboardLiveGame[]> {
  const { data, error } = await db
    .from('games')
    .select('id, team_id, opponent_name, location_type, neutral_home_team')
    .in('team_id', scopeTeamIds)
    .eq('status', 'in_progress')
    .order('started_at', { ascending: true, nullsFirst: false });
  if (error) throw error;

  return Promise.all(
    ((data ?? []) as LiveGameRow[]).map(async (game) => {
      const log = await fetchGameEventLog(db, game.id);
      if (log.error) throw new Error(`events for live game ${game.id}: ${log.error.message}`);
      const state = deriveGameState(game.id, filterResetAndReverted(log.data).map(toGameEvent), game.team_id);
      const isHome = weAreHome(game.location_type, game.neutral_home_team);
      return {
        id: game.id,
        teamId: game.team_id,
        teamName: teamNames[game.team_id] ?? 'Our team',
        opponentName: game.opponent_name,
        isHome,
        ourScore: isHome ? state.homeScore : state.awayScore,
        theirScore: isHome ? state.awayScore : state.homeScore,
        inning: state.inning,
        isTopOfInning: state.isTopOfInning,
        outs: state.outs,
      };
    }),
  );
}

/** The scope's last completed games, newest first, scored from our side. */
async function loadRecentGames(
  db: SupabaseClient,
  teamId: string,
  scopeTeamIds: string[],
  view: 'team' | 'league',
  teamNames: Record<string, string>,
): Promise<DashboardRecentGame[]> {
  const { data, error } = await db
    .from('games')
    .select('id, team_id, opponent_name, scheduled_at, time_zone, location_type, neutral_home_team, home_score, away_score, completed_at')
    .in('team_id', scopeTeamIds)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(RECENT_GAMES);
  if (error) throw error;

  return ((data ?? []) as RecentGameRow[]).map((g) => {
    const isHome = weAreHome(g.location_type, g.neutral_home_team);
    const home = g.home_score ?? 0;
    const away = g.away_score ?? 0;
    const teamLabel = view === 'league' && g.team_id !== teamId ? teamNames[g.team_id] : null;
    return {
      id: g.id,
      date: g.completed_at ?? g.scheduled_at,
      timeZone: g.time_zone,
      opponent: teamLabel ? `${teamLabel}: ${g.opponent_name}` : g.opponent_name,
      isHome,
      ourScore: isHome ? home : away,
      theirScore: isHome ? away : home,
    };
  });
}

/** The latest posts in the team's announcement channels, with who posted them. */
async function loadAnnouncements(db: SupabaseClient, teamId: string): Promise<{ items: DashboardAnnouncement[]; firstChannelId: string | null }> {
  const { data: channels, error } = await db.from('channels').select('id, name').eq('team_id', teamId).eq('channel_type', 'announcement');
  if (error) throw error;
  const channelRows = (channels ?? []) as Array<{ id: string; name: string | null }>;
  if (channelRows.length === 0) return { items: [], firstChannelId: null };

  const { data: messages, error: messagesError } = await db
    .from('messages')
    .select('id, body, created_at, channel_id, sender_id')
    .in('channel_id', channelRows.map((c) => c.id))
    .order('created_at', { ascending: false })
    .limit(ANNOUNCEMENTS);
  if (messagesError) throw messagesError;
  const messageRows = (messages ?? []) as Array<{ id: string; body: string; created_at: string; channel_id: string; sender_id: string | null }>;

  const senderIds = [...new Set(messageRows.map((m) => m.sender_id).filter((id): id is string => id !== null))];
  const senders = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles, error: profilesError } = await db.from('user_profiles').select('id, first_name, last_name').in('id', senderIds);
    if (profilesError) throw profilesError;
    for (const p of (profiles ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>) {
      const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
      if (name) senders.set(p.id, name);
    }
  }

  const channelNames = new Map(channelRows.map((c) => [c.id, c.name]));
  return {
    firstChannelId: channelRows[0].id,
    items: messageRows.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.created_at,
      senderName: (m.sender_id && senders.get(m.sender_id)) || 'Coach',
      channelName: channelNames.get(m.channel_id) ?? null,
    })),
  };
}

/** Wins, losses and runs over the recent games, as the web's Recent record and Run diff tiles show. */
function recordOf(games: DashboardRecentGame[]): DashboardResponse['record'] {
  return {
    wins: games.filter((g) => g.ourScore > g.theirScore).length,
    losses: games.filter((g) => g.ourScore < g.theirScore).length,
    runsFor: games.reduce((sum, g) => sum + g.ourScore, 0),
    runsAgainst: games.reduce((sum, g) => sum + g.theirScore, 0),
  };
}

/** A `game_events` row as the shared replay reads it. */
function toGameEvent(row: Record<string, unknown>): GameEvent {
  return {
    id: row.id as string,
    gameId: row.game_id as string,
    sequenceNumber: row.sequence_number as number,
    eventType: row.event_type as EventType,
    inning: row.inning as number,
    isTopOfInning: row.is_top_of_inning as boolean,
    payload: (row.payload ?? {}) as GameEvent['payload'],
    occurredAt: row.occurred_at as string,
    createdBy: (row.created_by as string | null) ?? '',
    deviceId: row.device_id as string,
    syncedAt: (row.synced_at as string | null) ?? undefined,
  };
}
