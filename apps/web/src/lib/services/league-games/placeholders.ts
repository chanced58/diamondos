import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachRole, listPlaceholdersInputSchema, resolvePlaceholderInputSchema } from '@baseball/shared';
import { refreshLeagueGame } from '@/lib/league-games/refresh';
import { authorizeLeagueStaff } from '../league-admin/authorize';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * Unknown players. When a scorer meets an opponent batter who isn't on the
 * roster, they add a placeholder to the opponent's league roster record
 * (`opponent_players.placeholder_game_id` = the league game). Afterwards the
 * placeholder is matched to a real roster player (`linked_player_id`), turned
 * into a new roster player, or marked as a fill-in; stats then count for the
 * linked player.
 *
 * Who may match: league admins; coaches and scorekeepers of the team that
 * scored against the placeholder's team (their `games` row points at the
 * placeholder's record); and the placeholder's own team's coaches.
 */

const UNIQUE_VIOLATION = '23505';
const SCORER_ROLES = ['scorekeeper'];

export interface UnmatchedPlaceholder {
  id: string;
  leagueGameId: string;
  gameLabel: string;
  teamId: string;
  teamName: string;
  label: string;
  jerseyNumber: string | null;
  canResolve: boolean;
}

interface PlaceholderRow {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  opponent_team_id: string;
  placeholder_game_id: string | null;
  linked_player_id: string | null;
  is_fill_in: boolean;
}

interface LeagueGameRow {
  id: string;
  league_id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string | null;
  time_zone: string | null;
}

interface PlaceholderContext {
  row: PlaceholderRow;
  leagueGame: LeagueGameRow;
  /** The team the placeholder plays for (the record's linked team). */
  teamId: string;
  /** The team that scored against it. */
  scorerTeamId: string;
}

const PLACEHOLDER_COLUMNS =
  'id, first_name, last_name, jersey_number, opponent_team_id, placeholder_game_id, linked_player_id, is_fill_in';
const LEAGUE_GAME_COLUMNS = 'id, league_id, home_team_id, away_team_id, scheduled_at, time_zone';

function failed<T>(action: string, context: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-placeholders] ${action} failed ${context} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

function labelOf(row: Pick<PlaceholderRow, 'first_name' | 'last_name'>): string {
  return `${row.first_name} ${row.last_name}`.trim();
}

/** Attaches each placeholder's league game and the two teams' roles. Rows whose record or game is missing are dropped. */
async function loadContexts(db: SupabaseClient, rows: PlaceholderRow[]): Promise<PlaceholderContext[]> {
  if (rows.length === 0) return [];
  const recordIds = Array.from(new Set(rows.map((row) => row.opponent_team_id)));
  const gameIds = Array.from(new Set(rows.map((row) => row.placeholder_game_id as string)));
  const [records, games] = await Promise.all([
    db.from('opponent_teams').select('id, linked_team_id').in('id', recordIds),
    db.from('league_games').select(LEAGUE_GAME_COLUMNS).in('id', gameIds),
  ]);
  if (records.error) throw records.error;
  if (games.error) throw games.error;

  const teamByRecord = new Map(
    ((records.data ?? []) as { id: string; linked_team_id: string | null }[]).map((record) => [record.id, record.linked_team_id]),
  );
  const gameById = new Map(((games.data ?? []) as LeagueGameRow[]).map((game) => [game.id, game]));

  const contexts: PlaceholderContext[] = [];
  for (const row of rows) {
    const teamId = teamByRecord.get(row.opponent_team_id);
    const leagueGame = gameById.get(row.placeholder_game_id as string);
    if (!teamId || !leagueGame) continue;
    if (teamId !== leagueGame.home_team_id && teamId !== leagueGame.away_team_id) continue;
    const scorerTeamId = teamId === leagueGame.home_team_id ? leagueGame.away_team_id : leagueGame.home_team_id;
    contexts.push({ row, leagueGame, teamId, scorerTeamId });
  }
  return contexts;
}

interface ActorPowers {
  adminLeagueIds: Set<string>;
  staffLeagueIds: Set<string>;
  rolesByTeam: Map<string, string>;
}

async function loadActorPowers(db: SupabaseClient, actorUserId: string, teamIds: string[]): Promise<ActorPowers> {
  const [staff, members] = await Promise.all([
    db.from('league_staff').select('league_id, role').eq('user_id', actorUserId).eq('is_active', true),
    teamIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db.from('team_members').select('team_id, role').eq('user_id', actorUserId).eq('is_active', true).in('team_id', teamIds),
  ]);
  if (staff.error) throw staff.error;
  if (members.error) throw members.error;
  const staffRows = (staff.data ?? []) as { league_id: string; role: string }[];
  return {
    adminLeagueIds: new Set(staffRows.filter((s) => s.role === 'league_admin').map((s) => s.league_id)),
    staffLeagueIds: new Set(staffRows.filter((s) => s.role === 'league_admin' || s.role === 'league_manager').map((s) => s.league_id)),
    rolesByTeam: new Map(((members.data ?? []) as { team_id: string; role: string }[]).map((m) => [m.team_id, m.role])),
  };
}

function mayResolve(powers: ActorPowers, context: PlaceholderContext): boolean {
  if (powers.adminLeagueIds.has(context.leagueGame.league_id)) return true;
  const scorerRole = powers.rolesByTeam.get(context.scorerTeamId);
  if (scorerRole && (isCoachRole(scorerRole) || SCORER_ROLES.includes(scorerRole))) return true;
  const ownRole = powers.rolesByTeam.get(context.teamId);
  return Boolean(ownRole && isCoachRole(ownRole));
}

async function loadPlaceholderRow(db: SupabaseClient, placeholderId: string): Promise<PlaceholderRow | null> {
  const { data, error } = await db.from('opponent_players').select(PLACEHOLDER_COLUMNS).eq('id', placeholderId).maybeSingle();
  if (error) throw error;
  const row = data as PlaceholderRow | null;
  return row?.placeholder_game_id ? row : null;
}

/** Whether the actor may match this placeholder. False for an unknown id. */
export async function canResolvePlaceholder(db: SupabaseClient, actorUserId: string, placeholderId: string): Promise<boolean> {
  try {
    const row = await loadPlaceholderRow(db, placeholderId);
    if (!row) return false;
    const [context] = await loadContexts(db, [row]);
    if (!context) return false;
    const powers = await loadActorPowers(db, actorUserId, [context.teamId, context.scorerTeamId]);
    return mayResolve(powers, context);
  } catch (error) {
    console.error(`[league-placeholders] canResolvePlaceholder failed placeholder=${placeholderId} actor=${actorUserId}:`, error);
    return false;
  }
}

// ── List ─────────────────────────────────────────────────────────────────────

function gameLabel(game: LeagueGameRow, names: Map<string, string>): string {
  const matchup = `${names.get(game.away_team_id) ?? 'Away'} at ${names.get(game.home_team_id) ?? 'Home'}`;
  if (!game.scheduled_at) return matchup;
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: game.time_zone ?? 'UTC',
  }).format(new Date(game.scheduled_at));
  return `${matchup}, ${date}`;
}

/**
 * Placeholders still waiting for a match: by league (league staff) or by one
 * league game (league staff, or a coach or scorekeeper of either team).
 */
export async function listUnmatchedPlaceholders(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ placeholders: UnmatchedPlaceholder[] }>> {
  const parsed = listPlaceholdersInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;
  const context = 'leagueId' in input ? `league=${input.leagueId}` : `league_game=${input.leagueGameId}`;

  try {
    let games: LeagueGameRow[];
    if ('leagueId' in input) {
      const access = await authorizeLeagueStaff(db, actorUserId, input.leagueId, { requireAdmin: false });
      if (!access.ok) return access;
      const { data, error } = await db.from('league_games').select(LEAGUE_GAME_COLUMNS).eq('league_id', input.leagueId);
      if (error) throw error;
      games = (data ?? []) as LeagueGameRow[];
    } else {
      const { data, error } = await db.from('league_games').select(LEAGUE_GAME_COLUMNS).eq('id', input.leagueGameId).maybeSingle();
      if (error) throw error;
      const game = data as LeagueGameRow | null;
      if (!game) return serviceError('not_found', 'Game not found.');
      const powers = await loadActorPowers(db, actorUserId, [game.home_team_id, game.away_team_id]);
      const onGame = [game.home_team_id, game.away_team_id].some((teamId) => powers.rolesByTeam.has(teamId));
      if (!powers.staffLeagueIds.has(game.league_id) && !onGame) return serviceError('not_found', 'Game not found.');
      games = [game];
    }
    if (games.length === 0) return serviceOk({ placeholders: [] });

    const { data: rows, error: rowsError } = await db
      .from('opponent_players')
      .select(PLACEHOLDER_COLUMNS)
      .in('placeholder_game_id', games.map((game) => game.id))
      .is('linked_player_id', null)
      .eq('is_fill_in', false)
      .eq('is_active', true);
    if (rowsError) throw rowsError;

    const contexts = await loadContexts(db, (rows ?? []) as PlaceholderRow[]);
    if (contexts.length === 0) return serviceOk({ placeholders: [] });

    const teamIds = Array.from(new Set(contexts.flatMap((c) => [c.teamId, c.scorerTeamId])));
    const [powers, teams] = await Promise.all([
      loadActorPowers(db, actorUserId, teamIds),
      db.from('teams').select('id, name').in('id', teamIds),
    ]);
    if (teams.error) throw teams.error;
    const names = new Map(((teams.data ?? []) as { id: string; name: string }[]).map((team) => [team.id, team.name]));

    const placeholders = contexts.map((c) => ({
      id: c.row.id,
      leagueGameId: c.leagueGame.id,
      gameLabel: gameLabel(c.leagueGame, names),
      teamId: c.teamId,
      teamName: names.get(c.teamId) ?? 'Team',
      label: labelOf(c.row),
      jerseyNumber: c.row.jersey_number,
      canResolve: mayResolve(powers, c),
    }));
    placeholders.sort((a, b) => a.gameLabel.localeCompare(b.gameLabel) || a.teamName.localeCompare(b.teamName) || a.label.localeCompare(b.label));
    return serviceOk({ placeholders });
  } catch (error) {
    return failed('listUnmatchedPlaceholders', context, actorUserId, error);
  }
}

// ── Create a roster player ───────────────────────────────────────────────────

/** Removes a just-created roster player and whatever was added with it; each failed step is logged and the rest still run. */
async function removeRosterPlayer(
  db: SupabaseClient,
  teamId: string,
  playerId: string,
  added: { membership: boolean; registry: boolean },
): Promise<void> {
  const steps: [string, PromiseLike<{ error: unknown }>][] = [];
  if (added.registry) steps.push(['registry', db.from('league_players').delete().eq('player_id', playerId)]);
  if (added.membership) steps.push(['membership', db.from('player_team_memberships').delete().eq('player_id', playerId).eq('team_id', teamId)]);
  steps.push(['player', db.from('players').delete().eq('id', playerId).eq('team_id', teamId)]);
  for (const [name, step] of steps) {
    const { error } = await step;
    if (error) console.error(`[league-placeholders] ${name} cleanup failed player=${playerId}:`, error);
  }
}

/**
 * Adds a player to a team's roster and registers them in the league: the
 * player row, an active membership carrying the jersey number, and the
 * `league_players` registry row. Internal: callers authorize first. A jersey
 * number already held by an active member comes back as `conflict`.
 */
export async function createLeagueRosterPlayer(
  db: SupabaseClient,
  input: { leagueId: string; teamId: string; firstName: string; lastName: string; jerseyNumber?: number },
): Promise<ServiceResult<{ playerId: string }>> {
  const { leagueId, teamId, firstName, lastName, jerseyNumber } = input;
  const context = `league=${leagueId} team=${teamId}`;
  const jersey = jerseyNumber ?? null;

  const { data: player, error } = await db
    .from('players')
    .insert({ team_id: teamId, first_name: firstName, last_name: lastName, jersey_number: jersey })
    .select('id')
    .single();
  if (error || !player) {
    console.error(`[league-placeholders] createLeagueRosterPlayer player insert failed ${context}:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
  const playerId = player.id as string;

  const { error: membershipError } = await db
    .from('player_team_memberships')
    .insert({ player_id: playerId, team_id: teamId, jersey_number: jersey, is_active: true });
  if (membershipError) {
    await removeRosterPlayer(db, teamId, playerId, { membership: false, registry: false });
    if ((membershipError as { code?: string }).code === UNIQUE_VIOLATION) {
      return serviceError('conflict', `Jersey #${jersey} is already taken on this team.`);
    }
    console.error(`[league-placeholders] createLeagueRosterPlayer membership insert failed ${context}:`, membershipError);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }

  const { error: registryError } = await db.from('league_players').insert({ league_id: leagueId, player_id: playerId });
  if (registryError) {
    await removeRosterPlayer(db, teamId, playerId, { membership: true, registry: false });
    console.error(`[league-placeholders] createLeagueRosterPlayer league registry insert failed ${context}:`, registryError);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }

  return serviceOk({ playerId });
}

// ── Resolve ──────────────────────────────────────────────────────────────────

/** A player may be matched when they are on the team's roster or have played for it. */
async function isOnTeam(db: SupabaseClient, playerId: string, teamId: string): Promise<boolean> {
  const { data: player, error } = await db.from('players').select('id, team_id').eq('id', playerId).maybeSingle();
  if (error) throw error;
  if (!player) return false;
  if ((player as { team_id: string | null }).team_id === teamId) return true;
  const { data: membership, error: membershipError } = await db
    .from('player_team_memberships')
    .select('player_id')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;
  return Boolean(membership);
}

export async function resolvePlaceholder(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ playerId: string | null }>> {
  const parsed = resolvePlaceholderInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;
  const context = `placeholder=${input.placeholderId}`;
  let leagueGameId: string;
  let playerId: string | null = null;

  try {
    const row = await loadPlaceholderRow(db, input.placeholderId);
    const [placeholder] = row ? await loadContexts(db, [row]) : [];
    if (!placeholder) return serviceError('not_found', 'Unknown player not found.');

    const powers = await loadActorPowers(db, actorUserId, [placeholder.teamId, placeholder.scorerTeamId]);
    if (!mayResolve(powers, placeholder)) {
      return serviceError('forbidden', 'You can not match players for this game.');
    }
    if (row?.linked_player_id) return serviceError('conflict', 'This player is already matched.');

    leagueGameId = placeholder.leagueGame.id;
    if (input.action === 'link') {
      if (!(await isOnTeam(db, input.playerId, placeholder.teamId))) {
        return serviceError('invalid', 'That player is not on this team.');
      }
      playerId = input.playerId;
    } else if (input.action === 'create') {
      const created = await createLeagueRosterPlayer(db, {
        leagueId: placeholder.leagueGame.league_id,
        teamId: placeholder.teamId,
        firstName: input.firstName,
        lastName: input.lastName,
        jerseyNumber: input.jerseyNumber,
      });
      if (!created.ok) return created;
      playerId = created.data.playerId;
    }

    const undoCreate = async () => {
      if (input.action === 'create' && playerId) {
        await removeRosterPlayer(db, placeholder.teamId, playerId, { membership: true, registry: true });
      }
    };

    // Guarded on still being unmatched, so two resolvers can't overwrite each other.
    const { data, error } = await db
      .from('opponent_players')
      .update(
        playerId
          ? { linked_player_id: playerId, is_fill_in: false, updated_at: new Date().toISOString() }
          : { is_fill_in: true, updated_at: new Date().toISOString() },
      )
      .eq('id', input.placeholderId)
      .is('linked_player_id', null)
      .select('id');
    if (error) {
      await undoCreate();
      throw error;
    }
    if (!data || data.length === 0) {
      await undoCreate();
      return serviceError('conflict', 'This player is already matched.');
    }
  } catch (error) {
    return failed('resolvePlaceholder', context, actorUserId, error);
  }

  // The match is saved; a refresh problem must not turn it into a failure.
  try {
    await refreshLeagueGame(db, leagueGameId, actorUserId);
  } catch (error) {
    console.error(`[league-placeholders] refresh failed league_game=${leagueGameId} ${context}:`, error);
  }
  return serviceOk({ playerId });
}
