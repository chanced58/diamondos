/**
 * Backfill for teams the user joined after the device's sync checkpoint.
 *
 * The pull is a timestamp window (`updated_at >= lastPulledAt`). RLS decides
 * which rows a user can see, so joining a team makes that team's existing
 * rows visible without touching their timestamps — they predate the window
 * and the incremental pull never delivers them. A coach invited to a team
 * that already has a schedule would see none of it on mobile, however often
 * the device synced.
 *
 * Each pull compares the user's active teams against the set recorded after
 * the previous pull and re-reads every synced table from the beginning for
 * the teams that are new. The register is written only after WatermelonDB
 * has applied the pull, and a team whose backfill failed is left out of it,
 * so the next cycle retries that team.
 */

export const KNOWN_TEAMS_KEY = 'sync.knownTeamIds';

// PostgREST caps responses (1000 rows by default), so a whole team history
// must be read in keyset pages rather than one request.
const BACKFILL_PAGE_SIZE = 1000;
// Keeps `in.(...)` filters on parent ids well inside URL length limits.
const ID_CHUNK_SIZE = 100;
// A page that never comes back empty would otherwise loop forever.
const MAX_BACKFILL_PAGES = 1000;

type Row = Record<string, unknown>;

interface PostgrestResult {
  data: Row[] | null;
  error: { message: string } | null;
}

interface BackfillQuery extends PromiseLike<PostgrestResult> {
  in(column: string, values: readonly string[]): BackfillQuery;
  eq(column: string, value: string): BackfillQuery;
  gt(column: string, value: string): BackfillQuery;
  order(column: string, options?: { ascending?: boolean }): BackfillQuery;
  limit(count: number): BackfillQuery;
}

/** The slice of the Supabase client the backfill reads through. */
export interface BackfillClient {
  from(table: string): { select(columns: string): BackfillQuery };
}

export interface TeamBackfill {
  games: Row[];
  gameEvents: Row[];
  gameLineups: Row[];
  players: Row[];
  channels: Row[];
  messages: Row[];
  opponentPlayers: Row[];
}

export const EMPTY_TEAM_BACKFILL: TeamBackfill = {
  games: [],
  gameEvents: [],
  gameLineups: [],
  players: [],
  channels: [],
  messages: [],
  opponentPlayers: [],
};

/**
 * Decides which teams need a full read this pull.
 *
 * - First pull: nothing — every table is already read from the beginning.
 * - Missing register on a device that has synced before (installed before
 *   this register existed, or the register was unreadable): every current
 *   team, once, since any of them may have been joined after the checkpoint.
 * - Otherwise: the teams not in the register. Leaving a team needs no
 *   backfill; the deletion reconciliation removes rows the user lost.
 */
export function planTeamBackfill({
  knownTeamIds,
  currentTeamIds,
  isFirstPull,
}: {
  knownTeamIds: readonly string[] | null;
  currentTeamIds: readonly string[];
  isFirstPull: boolean;
}): { backfillTeamIds: string[]; membershipChanged: boolean } {
  if (isFirstPull) return { backfillTeamIds: [], membershipChanged: false };
  if (knownTeamIds == null) return { backfillTeamIds: [...currentTeamIds], membershipChanged: true };

  const known = new Set(knownTeamIds);
  const current = new Set(currentTeamIds);
  const backfillTeamIds = currentTeamIds.filter((id) => !known.has(id));
  const leftTeam = knownTeamIds.some((id) => !current.has(id));
  return { backfillTeamIds, membershipChanged: backfillTeamIds.length > 0 || leftTeam };
}

/** Reads the stored register; anything unreadable counts as unknown. */
export function parseKnownTeamIds(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) return parsed;
    console.warn(`sync: ${KNOWN_TEAMS_KEY} is not a list of team ids; backfilling every team`);
  } catch (error) {
    console.warn(`sync: ${KNOWN_TEAMS_KEY} is unreadable; backfilling every team`, error);
  }
  return null;
}

/**
 * Unions two row lists by `id`; a row in `later` replaces one in `earlier`.
 * Typed by `later` (the incremental pull's rows): backfill rows come from the
 * same table through the same select, so they share its shape.
 */
export function mergeRowsById<T extends Row>(earlier: readonly Row[] | null, later: readonly T[] | null): T[] {
  const byId = new Map<unknown, T>();
  for (const row of earlier ?? []) byId.set(row.id, row as T);
  for (const row of later ?? []) byId.set(row.id, row);
  return [...byId.values()];
}

/**
 * Reads every row the given teams own from each table the sync engine
 * mirrors. Uses the same selects as the incremental pull so the rows map
 * identically. Throws on any failed query.
 */
export async function fetchTeamBackfill(
  client: BackfillClient,
  teamIds: readonly string[],
  userId: string,
  { pageSize = BACKFILL_PAGE_SIZE }: { pageSize?: number } = {},
): Promise<TeamBackfill> {
  if (teamIds.length === 0) return EMPTY_TEAM_BACKFILL;

  const byParent = (table: string, column: string, parentIds: readonly string[], select = '*') =>
    fetchAllByParent(client, table, select, column, parentIds, pageSize);

  const [games, players, channels, opponentTeams] = await Promise.all([
    byParent('games', 'team_id', teamIds),
    byParent('players', 'team_id', teamIds),
    fetchAllByParent(
      client,
      'channels',
      '*, channel_members!inner(user_id, can_post)',
      'team_id',
      teamIds,
      pageSize,
      (query) => query.eq('channel_members.user_id', userId),
    ),
    byParent('opponent_teams', 'team_id', teamIds, 'id'),
  ]);

  const gameIds = games.map((row) => String(row.id));
  const channelIds = channels.map((row) => String(row.id));
  const opponentTeamIds = opponentTeams.map((row) => String(row.id));

  const [gameEvents, gameLineups, messages, opponentPlayers] = await Promise.all([
    byParent('game_events', 'game_id', gameIds),
    byParent('game_lineups', 'game_id', gameIds),
    byParent('messages', 'channel_id', channelIds, '*, user_profiles!sender_id(first_name, last_name)'),
    byParent('opponent_players', 'opponent_team_id', opponentTeamIds),
  ]);

  return { games, gameEvents, gameLineups, players, channels, messages, opponentPlayers };
}

/**
 * Best-effort wrapper around `fetchTeamBackfill` for the pull. A failure must
 * not reject the pull: WatermelonDB would then skip the push, holding queued
 * game events on the device for as long as a large backfill keeps failing on
 * a weak connection. The failed teams are left out of `loadedTeamIds`, so
 * they stay "new" and are retried next cycle.
 */
export async function loadTeamBackfill(
  client: BackfillClient,
  { currentTeamIds, backfillTeamIds, userId }: {
    currentTeamIds: readonly string[];
    backfillTeamIds: readonly string[];
    userId: string;
  },
): Promise<{ backfill: TeamBackfill; loadedTeamIds: string[] }> {
  if (backfillTeamIds.length === 0) return { backfill: EMPTY_TEAM_BACKFILL, loadedTeamIds: [...currentTeamIds] };
  try {
    const backfill = await fetchTeamBackfill(client, backfillTeamIds, userId);
    return { backfill, loadedTeamIds: [...currentTeamIds] };
  } catch (error) {
    console.warn('sync: team backfill failed; retrying next cycle', backfillTeamIds, error);
    const pending = new Set(backfillTeamIds);
    return { backfill: EMPTY_TEAM_BACKFILL, loadedTeamIds: currentTeamIds.filter((id) => !pending.has(id)) };
  }
}

async function fetchAllByParent(
  client: BackfillClient,
  table: string,
  select: string,
  parentColumn: string,
  parentIds: readonly string[],
  pageSize: number,
  refine: (query: BackfillQuery) => BackfillQuery = (query) => query,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; start < parentIds.length; start += ID_CHUNK_SIZE) {
    const chunk = parentIds.slice(start, start + ID_CHUNK_SIZE);
    let cursor: string | null = null;
    for (let page = 0; ; page++) {
      if (page >= MAX_BACKFILL_PAGES) {
        throw new Error(`sync: ${table} backfill exceeded ${MAX_BACKFILL_PAGES} pages`);
      }
      let query = refine(client.from(table).select(select).in(parentColumn, chunk));
      if (cursor != null) query = query.gt('id', cursor);
      const { data, error } = await query.order('id', { ascending: true }).limit(pageSize);
      if (error) throw new Error(`sync: ${table} backfill failed: ${error.message}`);
      if (!Array.isArray(data)) throw new Error(`sync: ${table} backfill returned no rows array`);
      if (data.length === 0) break;
      rows.push(...data);
      cursor = String(data[data.length - 1].id);
    }
  }
  return rows;
}

// ─── membership change notifications ─────────────────────────────────────────
//
// RoleProvider loads the team list once per sign-in. The sync engine is what
// notices a team was joined or left (it checks every cycle), so it notifies
// here and RoleProvider reloads the list.

type MembershipListener = () => void;
const membershipListeners = new Set<MembershipListener>();

export function subscribeToTeamMembershipChanges(listener: MembershipListener): () => void {
  membershipListeners.add(listener);
  return () => {
    membershipListeners.delete(listener);
  };
}

export function notifyTeamMembershipChange(): void {
  for (const listener of [...membershipListeners]) {
    try {
      listener();
    } catch (error) {
      console.warn('sync: team membership listener failed', error);
    }
  }
}
