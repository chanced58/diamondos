import { Q } from '@nozbe/watermelondb';
import { synchronize, type SyncPullArgs, type SyncPushArgs } from '@nozbe/watermelondb/sync';
import { computeLineupDeletes, PlayerPosition } from '@baseball/shared';
import { database } from '../db';
import type { Channel } from '../db/models/Channel';
import type { Game } from '../db/models/Game';
import type { GameEvent } from '../db/models/GameEvent';
import type { GameLineup } from '../db/models/GameLineup';
import {
  leaguePlayerRecordId,
  parseLeaguePlayerRecordId,
  type LeaguePlayer,
} from '../db/models/LeaguePlayer';
import type { Message } from '../db/models/Message';
import type { OpponentGameLineup } from '../db/models/OpponentGameLineup';
import type { OpponentPlayer } from '../db/models/OpponentPlayer';
import type { Player } from '../db/models/Player';
import { getSupabaseClient } from '../lib/supabase';
import {
  applyServerLineupSnapshot,
  getDirtyLineupState,
  pushLineupsForGame,
} from './lineup-sync';
import {
  computeCascadeDeletions,
  computeTableDeletion,
} from './reconcile-deletions';


/**
 * Safely parse a payload stored as JSON in WatermelonDB. If the column is
 * corrupt (should not happen on records this client created, but may
 * happen for records pulled from a malformed server row or hand-edited
 * local DB), we return null so the caller can skip that row rather than
 * abort the whole sync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeParsePayload(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn('sync: skipping event with unparseable payload', err);
    return null;
  }
}

/**
 * Dead-letter register for game events that can never be pushed.
 *
 * A payload that fails JSON.parse fails deterministically — retrying cannot
 * help. Previously the sync cycle threw on these so WatermelonDB would leave
 * them unsynced, but that made a single corrupt row a poison pill: every
 * cycle re-read it, threw, and retried forever. Worse, failing the cycle also
 * kept every *healthy* event in the same batch unsynced, so the queue could
 * never drain and the scorer got an endless "Sync failed" toast.
 *
 * Instead we record the offenders here and let the cycle succeed. The rows
 * stay in the local database for inspection — nothing is deleted — they are
 * simply no longer retried. Read with `getQuarantinedEventIds()`.
 */
const QUARANTINED_EVENTS_KEY = 'sync.quarantinedEventIds';
const QUARANTINE_CAP = 200;

export async function getQuarantinedEventIds(): Promise<string[]> {
  try {
    const raw = await database.localStorage.get<string>(QUARANTINED_EVENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (err) {
    // The dropped ids are the exact data this register exists to preserve,
    // so losing them has to be visible rather than silently starting over.
    console.warn(
      `sync: quarantine register at ${QUARANTINED_EVENTS_KEY} is unreadable; starting empty`,
      err,
    );
    return [];
  }
}

async function quarantineEventIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const existing = await getQuarantinedEventIds();
    // Keep the most recent offenders; this is a diagnostic register, not a
    // queue, so an unbounded list would grow forever on a wedged device.
    const merged = [...new Set([...existing, ...ids])].slice(-QUARANTINE_CAP);
    await database.localStorage.set(QUARANTINED_EVENTS_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('sync: could not persist quarantined event ids', err);
  }
}

// ─── deletion reconciliation (H3) ───────────────────────────────────────────
//
// The pull below is a set of incremental queries (`gte(updated_at, since)`
// and friends) for games, players, channels, messages, league_players, and
// opponent_players. An incremental delta cannot tell "unchanged since last
// sync, so absent from this window" apart from "deleted, or moved out of
// this device's RLS scope" — there is no id set to diff against. The only
// fix is a separate id-only fetch of the whole table (in the same scope the
// main pull uses) and diffing that against local ids, the same technique the
// game_lineups / opponent_game_lineups diff above already uses on a mutable
// table. See `./reconcile-deletions.ts` for the pure diff and its safety
// rule: a row is only ever deleted if it was already synced at least once.
//
// game_events and messages are excluded from the id fetch — both grow
// without bound over a season, and fetching every id every cycle would be
// the "obvious fix" the design brief explicitly rejects. Instead they are
// cascaded from their parent's deletion (games → game_events, channels →
// messages), mirroring the server's own FK cascade. This is exact for
// game_events (append-only, only ever removed via the game cascade) and for
// messages EXCEPT for the case of a single message deleted server-side while
// its channel survives — there is no such feature today, so that case is out
// of scope; covering it would require the unbounded id fetch this design
// exists to avoid.
//
// Deletions are rare and a stale row lingering locally for a few minutes is
// harmless, so this does not run every sync cycle — only every
// DELETION_RECONCILE_INTERVAL_MS, tracked the same in-memory way this file
// already tracks `lifecycleReconciledGames` / `pendingSnapshotGames`. Losing
// the timestamp on an app restart just means the next cycle reconciles
// again immediately, which is the safe direction to fail in.
//
// The clock compared against this gate is the SERVER clock (`pullTimestamp`,
// already captured per cycle for the `since` checkpoint below) rather than
// the device clock, for the same reason the checkpoint itself uses it: a
// fast device clock must not make the gate open more or less often than
// intended.
const DELETION_RECONCILE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
let lastDeletionReconcileAt = 0;

/** Exported for tests; the cadence gate itself is pure. */
export function shouldReconcileDeletions(
  now: number,
  lastRunAt: number,
  intervalMs: number = DELETION_RECONCILE_INTERVAL_MS,
): boolean {
  return now - lastRunAt >= intervalMs;
}

const EPOCH_ISO = new Date(0).toISOString();

type IdSetResult = { ok: true; ids: Set<string> } | { ok: false };

// Supabase/PostgREST caps a response at a fixed row count (this project's own
// `apps/web/.../card/actions.ts:210` documents the default 1000-row cap) —
// undocumented per-request, so a naive query silently truncates once a table
// crosses it. A truncated page is `{ data: [...], error: null }`, a
// *successful* response, so it defeated both existing safety layers
// (round-1 review, Critical 1).
//
// Round-1's fix (`.order('id') + .range(offset, ...)`, stopping at a short
// page) was itself unsafe (round-2 review, N1): offset pagination re-reads a
// live table. A row deleted server-side between page N and page N+1 shifts
// every following row left by one, so the row that lands exactly on the new
// page boundary is skipped entirely — never returned on either page — and
// reads as a false deletion. On `games` this is the original catastrophic
// path verbatim, since the game_events cascade below carries no syncedAt
// guard.
//
// Every id fetch below uses KEYSET pagination instead: `.gt(<key>, cursor)`
// rather than an offset. A row deleted after the cursor cannot cause an
// already-scanned or not-yet-scanned surviving row to be skipped — the next
// page is simply "everything with a key greater than the last one we saw,"
// which is unaffected by row shifts before or after that point.
//
// N3: termination is on an EMPTY page, not a short one. `ID_FETCH_PAGE_SIZE`
// happens to equal the documented default cap; terminating on "fewer than
// pageSize" would silently reintroduce Critical 1 the moment a deployment's
// `db-max-rows` is set below that value (a capped-short page would look like
// the true last page). Terminating only on empty is correct regardless of
// the relationship between pageSize and whatever cap is actually in effect:
// if the server caps a page below pageSize, the next call's cursor simply
// continues from the last row actually received, at the cost of one extra
// round trip when a table happens to end exactly on a page boundary.
const ID_FETCH_PAGE_SIZE = 1000;
// Defensive circuit breaker: stop paginating (and report failure) rather
// than loop indefinitely if a table somehow never returns an empty page. At
// ID_FETCH_PAGE_SIZE=1000 this allows at least 1,000,000 rows per table per
// cycle — far beyond anything this app's tables should reach — before
// tripping.
const MAX_ID_FETCH_PAGES = 1000;

/**
 * `cursor` is the identify-function's value from the last row of the
 * previous page, or `null` for the first page. Each table's factory decides
 * how to turn that into a `.gt(...)` (or, for a composite key, an `.or(...)`
 * keyset) filter.
 */
type PageFetcher = (
  cursor: string | null,
  limit: number,
) => PromiseLike<{
  data: Array<Record<string, unknown>> | null;
  error: { message: string } | null;
}>;

/**
 * Fetches every row of a keyset-paginated id query, looping until an empty
 * page signals the end (see the design notes above `ID_FETCH_PAGE_SIZE` for
 * why keyset + empty-termination, not offset + short-page termination).
 * Folds every failure mode — a thrown exception, a Postgrest `error`, or a
 * response with no `data` array at all (round-1 review, Important 3: `{
 * data: null, error: null }` must not be read as "confirmed empty table") —
 * into `{ ok: false }`, never into an empty-but-successful result. Exported
 * for direct testing (round-1 review, Important 5): this is the exact I/O
 * boundary where the second safety rule (a failed fetch is "no information,"
 * not "no rows") has to hold, and it needs nothing beyond a fake
 * `PromiseLike` to test.
 *
 * `getCursor` extracts the next cursor from the last row of a page — for
 * every table here this is the same function used to build the final id
 * `Set` (see `fetchIdSet`), since the row's identity IS the keyset sort key.
 */
export async function fetchAllRows(
  label: string,
  pageFactory: PageFetcher,
  getCursor: (row: Record<string, unknown>) => string,
  pageSize: number = ID_FETCH_PAGE_SIZE,
): Promise<{ ok: true; rows: Array<Record<string, unknown>> } | { ok: false }> {
  const rows: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  try {
    for (let page = 0; page < MAX_ID_FETCH_PAGES; page++) {
      const { data, error } = await pageFactory(cursor, pageSize);
      if (error) {
        console.warn(
          `sync: ${label} id fetch failed after cursor ${cursor ?? '(start)'}; reconciling nothing for ${label} this cycle`,
          error,
        );
        return { ok: false };
      }
      if (!Array.isArray(data)) {
        console.warn(
          `sync: ${label} id fetch returned no data array after cursor ${cursor ?? '(start)'}; reconciling nothing for ${label} this cycle`,
        );
        return { ok: false };
      }
      if (data.length === 0) return { ok: true, rows };
      rows.push(...data);
      cursor = getCursor(data[data.length - 1]);
    }
    console.warn(
      `sync: ${label} id fetch exceeded ${MAX_ID_FETCH_PAGES} pages without finishing; reconciling nothing for ${label} this cycle`,
    );
    return { ok: false };
  } catch (err) {
    console.warn(
      `sync: ${label} id fetch threw; reconciling nothing for ${label} this cycle`,
      err,
    );
    return { ok: false };
  }
}

/**
 * Fetches an id-only column for one table (keyset-paginated — see
 * `fetchAllRows`) and reduces it to the id `Set` shape `computeTableDeletion`
 * expects. `identify` does double duty as both the id extractor and the
 * pagination cursor, since for every table here the row's identity is
 * exactly its keyset sort key.
 */
async function fetchIdSet(
  label: string,
  pageFactory: PageFetcher,
  identify: (row: Record<string, unknown>) => string,
): Promise<IdSetResult> {
  const result = await fetchAllRows(label, pageFactory, identify);
  if (!result.ok) return { ok: false };
  return { ok: true, ids: new Set(result.rows.map(identify)) };
}

/**
 * `players` is special: the local table mirrors two different server
 * sources merged together (see the `playerRowsById` merge in pullChanges) —
 * the coach's own roster via a bare `players` SELECT (RLS-scoped to their
 * team), and every OTHER team's/league's guest & free-agent identities via
 * the PII-free `league_player_identities()` RPC (there is no broad `players`
 * SELECT policy for those — see supabase/migrations/20260702000001).
 *
 * A bare `select('id')` on `players` alone would only return the coach's own
 * team, so every cross-team identity mirrored locally for the guest picker
 * would look "deleted" and get wiped on every reconciliation pass. The id
 * fetch must union both sources, exactly mirroring that merge — each one
 * keyset-paginated independently, and both must succeed or the whole table
 * is treated as failed (a half-correct union is not a correct scope).
 */
async function fetchPlayerIdSet(
  supabase: ReturnType<typeof getSupabaseClient>,
): Promise<IdSetResult> {
  const identify = (row: Record<string, unknown>) => row.id as string;
  const [ownTeam, leagueIdentities] = await Promise.all([
    fetchAllRows(
      'players (own team)',
      (cursor, limit) => {
        let query = supabase.from('players').select('id').order('id').limit(limit);
        if (cursor !== null) query = query.gt('id', cursor);
        return query;
      },
      identify,
    ),
    // p_since defaults to '-infinity' server-side; passed explicitly here so
    // this fetch is unambiguously "every identity", independent of what the
    // main pull's incremental p_since happens to be this cycle.
    fetchAllRows(
      'players (league identities)',
      (cursor, limit) => {
        let query = supabase
          .rpc('league_player_identities', { p_since: EPOCH_ISO })
          .order('id')
          .limit(limit);
        if (cursor !== null) query = query.gt('id', cursor);
        return query;
      },
      identify,
    ),
  ]);
  if (!ownTeam.ok || !leagueIdentities.ok) return { ok: false };
  const ids = new Set<string>();
  for (const row of ownTeam.rows as Array<{ id: string }>) ids.add(row.id);
  for (const row of leagueIdentities.rows as Array<{ id: string }>) ids.add(row.id);
  return { ok: true, ids };
}

interface DeletionResult {
  games: string[];
  players: string[];
  channels: string[];
  leaguePlayers: string[];
  opponentPlayers: string[];
  gameEvents: string[];
  messages: string[];
}

/**
 * Converts an id-fetch outcome into the `Set<string> | null` shape
 * `computeTableDeletion` takes, in exactly one place — so there is one spot
 * for the "ok ? ids : null" mapping to get wrong, not five hand-written
 * copies (round-1 review, Important 5, point 3).
 */
function toIdSetOrNull(result: IdSetResult): Set<string> | null {
  return result.ok ? result.ids : null;
}

/**
 * Applies `computeTableDeletion` for one table and logs loudly if the
 * blast-radius guard suppressed it (round-1 review, Critical 2) — a failed
 * fetch is already logged inside `fetchAllRows`, so only the guard case
 * needs its own log here.
 */
function resolveTableDeletion(
  label: string,
  idSetResult: IdSetResult,
  localRows: Array<{ id: string; syncedAt: number | null | undefined }>,
): string[] {
  const outcome = computeTableDeletion(toIdSetOrNull(idSetResult), localRows);
  if (outcome.status === 'blast-radius-guarded') {
    const syncedRowCount = localRows.filter((r) => r.syncedAt != null).length;
    console.warn(
      `sync: ${label} deletion blast radius exceeded (${outcome.attemptedCount} of ${syncedRowCount} synced rows would have been deleted) — skipping deletion for ${label} this cycle`,
    );
  }
  return outcome.ids;
}

/**
 * Fetches id sets for the five small, bounded parent tables (in parallel,
 * each isolated so one table's failure doesn't block the others), diffs
 * each against its local rows (guarded by both the syncedAt safety rule and
 * the blast-radius ceiling), then derives the two unbounded child tables by
 * cascading from the games/channels actually deleted this cycle. Never
 * throws — see the try/catch around this call in pullChanges — but every
 * internal failure mode degrades to "delete nothing for that table," never
 * to "delete everything."
 */
async function reconcileServerDeletions(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
): Promise<DeletionResult> {
  const [gamesIdSet, playersIdSet, channelsIdSet, leaguePlayersIdSet, oppPlayersIdSet] =
    await Promise.all([
      fetchIdSet(
        'games',
        (cursor, limit) => {
          let query = supabase.from('games').select('id').order('id').limit(limit);
          if (cursor !== null) query = query.gt('id', cursor);
          return query;
        },
        (r) => r.id as string,
      ),
      fetchPlayerIdSet(supabase),
      fetchIdSet(
        'channels',
        (cursor, limit) => {
          let query = supabase
            .from('channels')
            .select('id, channel_members!inner(user_id, can_post)')
            .eq('channel_members.user_id', userId)
            .order('id')
            .limit(limit);
          if (cursor !== null) query = query.gt('id', cursor);
          return query;
        },
        (r) => r.id as string,
      ),
      // league_players has no `id` column (composite PK: league_id,
      // player_id), so its keyset cursor is the same flattened
      // `${leagueId}:${playerId}` string already used as the local record
      // id — parsed back apart here to build a composite `.or()` keyset
      // filter: `league_id > cursorLeagueId OR (league_id = cursorLeagueId
      // AND player_id > cursorPlayerId)`, the standard tuple-comparison
      // pattern for a two-column keyset, expressed as PostgREST's `.or()`
      // syntax since there is no direct tuple-`.gt()`. Both columns are
      // UUIDs, which never contain `:`, `,`, or `.`, so the interpolated
      // values can't break the filter grammar.
      fetchIdSet(
        'league_players',
        (cursor, limit) => {
          let query = supabase
            .from('league_players')
            .select('league_id, player_id')
            .order('league_id')
            .order('player_id')
            .limit(limit);
          if (cursor !== null) {
            const { leagueId, playerRemoteId } = parseLeaguePlayerRecordId(cursor);
            query = query.or(
              `league_id.gt.${leagueId},and(league_id.eq.${leagueId},player_id.gt.${playerRemoteId})`,
            );
          }
          return query;
        },
        (r) => leaguePlayerRecordId(r.league_id as string, r.player_id as string),
      ),
      fetchIdSet(
        'opponent_players',
        (cursor, limit) => {
          let query = supabase.from('opponent_players').select('id').order('id').limit(limit);
          if (cursor !== null) query = query.gt('id', cursor);
          return query;
        },
        (r) => r.id as string,
      ),
    ]);

  const [gameRows, playerRows, channelRows, leaguePlayerRows, oppPlayerRows] = await Promise.all([
    database.get<Game>('games').query().fetch(),
    database.get<Player>('players').query().fetch(),
    database.get<Channel>('channels').query().fetch(),
    database.get<LeaguePlayer>('league_players').query().fetch(),
    database.get<OpponentPlayer>('opponent_players').query().fetch(),
  ]);

  const games = resolveTableDeletion(
    'games',
    gamesIdSet,
    gameRows.map((r) => ({ id: r.id, syncedAt: r.syncedAt })),
  );
  const players = resolveTableDeletion(
    'players',
    playersIdSet,
    playerRows.map((r) => ({ id: r.id, syncedAt: r.syncedAt })),
  );
  const channels = resolveTableDeletion(
    'channels',
    channelsIdSet,
    channelRows.map((r) => ({ id: r.id, syncedAt: r.syncedAt })),
  );
  const leaguePlayers = resolveTableDeletion(
    'league_players',
    leaguePlayersIdSet,
    leaguePlayerRows.map((r) => ({ id: r.id, syncedAt: r.syncedAt })),
  );
  const opponentPlayers = resolveTableDeletion(
    'opponent_players',
    oppPlayersIdSet,
    oppPlayerRows.map((r) => ({ id: r.id, syncedAt: r.syncedAt })),
  );

  // Cascades run off THIS cycle's confirmed parent deletions only — if the
  // games fetch failed (or was blast-radius-guarded), `games` is [] and no
  // event is ever cascaded from it this cycle, which is the correct,
  // conservative outcome.
  const [eventRows, messageRows] = await Promise.all([
    games.length > 0
      ? database
          .get<GameEvent>('game_events')
          .query(Q.where('game_remote_id', Q.oneOf(games)))
          .fetch()
      : Promise.resolve([] as GameEvent[]),
    channels.length > 0
      ? database
          .get<Message>('messages')
          .query(Q.where('channel_remote_id', Q.oneOf(channels)))
          .fetch()
      : Promise.resolve([] as Message[]),
  ]);
  const gameEvents = computeCascadeDeletions(
    games,
    eventRows.map((r) => ({ id: r.id, parentId: r.gameRemoteId })),
  );
  const messages = computeCascadeDeletions(
    channels,
    messageRows.map((r) => ({ id: r.id, parentId: r.channelRemoteId })),
  );

  // Deletion audit log (round-1 review, "also required"): the only logging
  // before this was on fetch *failure* — nothing recorded what was actually
  // removed. When a coach reports "my game vanished," this is the only trail
  // that can distinguish a genuine server-side delete from a cap artifact or
  // a scope flip. Cascades carry no syncedAt guard, so the unsynced counts
  // here are the actual offline-work-loss figures for this cycle, not just
  // row counts.
  const totalDeletions =
    games.length +
    players.length +
    channels.length +
    leaguePlayers.length +
    opponentPlayers.length +
    gameEvents.length +
    messages.length;
  if (totalDeletions > 0) {
    const gameEventIds = new Set(gameEvents);
    const messageIds = new Set(messages);
    const unsyncedGameEventsDeleted = eventRows.filter(
      (r) => gameEventIds.has(r.id) && r.syncedAt == null,
    ).length;
    const unsyncedMessagesDeleted = messageRows.filter(
      (r) => messageIds.has(r.id) && r.syncedAt == null,
    ).length;
    console.warn('sync: deletion reconciliation removing local rows this cycle', {
      games: games.length,
      players: players.length,
      channels: channels.length,
      leaguePlayers: leaguePlayers.length,
      opponentPlayers: opponentPlayers.length,
      gameEvents: gameEvents.length,
      unsyncedGameEventsDeleted,
      messages: messages.length,
      unsyncedMessagesDeleted,
    });
  }

  return { games, players, channels, leaguePlayers, opponentPlayers, gameEvents, messages };
}

const EMPTY_DELETIONS: DeletionResult = {
  games: [],
  players: [],
  channels: [],
  leaguePlayers: [],
  opponentPlayers: [],
  gameEvents: [],
  messages: [],
};

/**
 * After a sequence-number collision (pg error 23505 on the game_events
 * unique(game_id, sequence_number) constraint), shift the local WDB
 * records' sequence numbers so they start above the server's current
 * max. Next sync cycle will push them successfully.
 *
 * `failedEvents` comes from WatermelonDB's changes.created array — each
 * entry is a raw record shape whose `id` field is the WDB internal id.
 */
async function reconcileSequenceNumbers(
  failedEvents: ReadonlyArray<Record<string, unknown>>,
  supabase: ReturnType<typeof getSupabaseClient>,
): Promise<void> {
  const byGame = new Map<string, Array<Record<string, unknown>>>();
  for (const e of failedEvents) {
    const gameRemoteId = e.game_remote_id as string | undefined;
    if (!gameRemoteId) continue;
    const list = byGame.get(gameRemoteId) ?? [];
    list.push(e);
    byGame.set(gameRemoteId, list);
  }

  const renumbers: Array<{ wdbId: string; newSeq: number }> = [];

  for (const [gameRemoteId, events] of byGame) {
    const { data, error } = await supabase
      .from('game_events')
      .select('sequence_number')
      .eq('game_id', gameRemoteId)
      .order('sequence_number', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('sync: could not fetch server max seq for reconciliation', error);
      continue;
    }

    const serverMax = (data?.[0]?.sequence_number as number | undefined) ?? 0;

    events.sort((a, b) => (a.sequence_number as number) - (b.sequence_number as number));
    let nextSeq = serverMax + 1;
    for (const e of events) {
      const currentSeq = e.sequence_number as number;
      // Renumber whenever the event's current seq number would collide
      // with a slot we've already planned to use. Using (currentSeq <
      // nextSeq) rather than (currentSeq <= serverMax) handles the gap
      // case: e.g. serverMax=10 with local events [9, 11] — under the
      // old condition event 9 renumbered to 11 and event 11 kept 11,
      // colliding again. Under the new condition event 9 → 11 and
      // event 11 → 12.
      if (currentSeq < nextSeq) {
        renumbers.push({ wdbId: e.id as string, newSeq: nextSeq });
        nextSeq += 1;
      } else {
        nextSeq = currentSeq + 1;
      }
    }
  }

  if (renumbers.length === 0) return;

  await database.write(async () => {
    const collection = database.get<GameEvent>('game_events');
    for (const { wdbId, newSeq } of renumbers) {
      const record = await collection.find(wdbId);
      await record.update((r) => {
        r.sequenceNumber = newSeq;
      });
    }
  });
}

// Games whose post-sync server-snapshot convergence failed and must be
// retried on subsequent cycles. In-memory only: an app restart loses the
// set, leaving those games stale-but-consistent until the next server-side
// lineup edit re-pulls them.
const pendingSnapshotGames = new Set<string>();

/**
 * Syncs the local WatermelonDB with Supabase.
 *
 * PULL: Fetches all records changed since the last sync from Supabase.
 * PUSH: Sends locally-created game_events (and any offline messages) to Supabase.
 *
 * Game events are immutable (append-only). Use upsert with ignoreDuplicates=true
 * so replays of the same event from offline devices are safe.
 */
export async function syncWithSupabase(): Promise<void> {
  const supabase = getSupabaseClient();

  // Games whose lineup push deferred to the server version (LWW skip);
  // converged after the sync cycle via applyServerLineupSnapshot.
  const skippedLineupGames: string[] = [];
  // Dirty lineup state computed once per cycle (pull runs before push inside
  // synchronize, and pull applies server rows as already-synced, so the two
  // phases can share one snapshot).
  let dirtyLineupState: Awaited<ReturnType<typeof getDirtyLineupState>> | null = null;

  // Whether game_events reached the server this cycle. Set inside pushChanges
  // after the game_events upsert succeeds — used so lifecycle reconciliation
  // still runs when a LATER deferred step (lineup/guest) fails the cycle, but
  // NOT when the event push itself failed (which would risk finalizing a game
  // whose events are not yet on the server).
  let eventsPushed = false;
  let syncOk = false;

  try {
  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt, migration }: SyncPullArgs) => {
      const epoch = new Date(0).toISOString();
      const since = lastPulledAt ? new Date(lastPulledAt).toISOString() : epoch;

      // On the first sync after a local schema migration, WatermelonDB tells
      // us which tables/columns are new so we can backfill them from epoch
      // without resetting the whole database.
      const migratedTables = new Set(migration?.tables ?? []);
      const migratedColumnTables = new Set((migration?.columns ?? []).map((c) => c.table));
      const lineupsSince = migratedTables.has('game_lineups') ? epoch : since;
      const leaguePlayersSince = migratedTables.has('league_players') ? epoch : since;
      const playersSince = migratedColumnTables.has('players') ? epoch : since;
      const oppPlayersSince = migratedTables.has('opponent_players') ? epoch : since;
      // games gained opponent_team_id in schema v3; backfill it from epoch on
      // the first sync after that migration or existing rows keep a null
      // column and the opponent roster stays unreachable.
      const gamesSince = migratedColumnTables.has('games') ? epoch : since;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        throw new Error('Cannot sync: user is not authenticated');
      }
      const userId = user.id;

      // The next checkpoint must come from the SERVER clock — the pull
      // filters on server-generated timestamps, and a fast device clock
      // would permanently skip rows committed "before" its inflated time.
      // Captured BEFORE the queries so overlap re-pulls (idempotent) rather
      // than gaps.
      const serverTimeResult = await supabase.rpc('server_time');
      if (serverTimeResult.error) throw serverTimeResult.error;
      const pullTimestamp = new Date(serverTimeResult.data as string).getTime();

      const [gamesResult, eventsResult, playersResult, leagueIdentitiesResult, channelsResult, messagesResult, lineupsResult, leaguePlayersResult, oppPlayersResult, pulledDirtyState] =
        await Promise.all([
          supabase.from('games').select('*').gte('updated_at', gamesSince),
          supabase.from('game_events').select('*').gte('synced_at', since),
          supabase.from('players').select('*').gte('updated_at', playersSince),
          // PII-free identities of league-registered players (other teams'
          // rosters, guests, free agents) — feeds the offline guest picker.
          supabase.rpc('league_player_identities', { p_since: playersSince }),
          supabase
            .from('channels')
            .select('*, channel_members!inner(user_id, can_post)')
            .eq('channel_members.user_id', userId)
            .gte('updated_at', since),
          supabase.from('messages').select('*, user_profiles!sender_id(first_name, last_name)').gte('created_at', since),
          supabase.from('game_lineups').select('*').gte('updated_at', lineupsSince),
          supabase.from('league_players').select('*').gte('registered_at', leaguePlayersSince),
          supabase.from('opponent_players').select('*').gte('updated_at', oppPlayersSince),
          getDirtyLineupState(database),
        ]);

      const firstError = [gamesResult, eventsResult, playersResult, leagueIdentitiesResult, channelsResult, messagesResult, lineupsResult, leaguePlayersResult, oppPlayersResult]
        .map((r) => r.error)
        .find((e) => e != null);
      if (firstError) throw firstError;

      // Opponent batting orders. opponent_game_lineups has no updated_at
      // server-side, so a timestamp window would never re-deliver an edited
      // row — instead refresh the whole order for the games this cycle
      // touched, plus any game with local opponent rows so a server-side
      // deletion still reaches the device. The tables are tiny (a batting
      // order, not a season), so a full read per touched game is cheap.
      const oppLineupGameIds = [
        ...new Set([
          ...(gamesResult.data ?? []).map((g) => g.id as string),
          ...(
            await database
              .get<OpponentGameLineup>('opponent_game_lineups')
              .query()
              .fetch()
          ).map((r) => r.gameRemoteId),
        ]),
      ];
      let oppLineupRows: Record<string, unknown>[] = [];
      let deletedOppLineupIds: string[] = [];
      if (oppLineupGameIds.length > 0) {
        const oppLineupsResult = await supabase
          .from('opponent_game_lineups')
          .select('*')
          .in('game_id', oppLineupGameIds);
        if (oppLineupsResult.error) throw oppLineupsResult.error;
        oppLineupRows = oppLineupsResult.data ?? [];

        // Rows the device holds for a refreshed game that the server no
        // longer has were deleted elsewhere; Postgres keeps no tombstones,
        // so diff the id sets. Locally-created rows not yet pushed are
        // excluded — they are absent server-side because they have not been
        // sent, not because anyone deleted them.
        const serverIds = new Set(oppLineupRows.map((r) => r.id as string));
        const localRows = await database
          .get<OpponentGameLineup>('opponent_game_lineups')
          .query(Q.where('game_remote_id', Q.oneOf(oppLineupGameIds)))
          .fetch();
        deletedOppLineupIds = localRows
          .filter((r) => r.syncedAt != null && !serverIds.has(r.id))
          .map((r) => r.id);
      }

      dirtyLineupState = pulledDirtyState;

      // Merge the RLS-scoped players pull with the league-identity RPC,
      // preferring the full table row when a player appears in both (the
      // coach's own roster is registered in the league too).
      const playerRowsById = new Map<string, Record<string, unknown>>();
      for (const row of leagueIdentitiesResult.data ?? []) playerRowsById.set(row.id, row);
      for (const row of playersResult.data ?? []) playerRowsById.set(row.id, row);

      // Lineups are mutable, so the pull needs two extra steps:
      //  1. Drop pulled rows for games with unsynced local lineup edits —
      //    pull runs before push inside synchronize(), and applying a web
      //    delete-reinsert here would destroy the device's rows before the
      //    mobile-wins push gets to run.
      //  2. Derive deletions for touched games by diffing the server's full
      //    id set against local rows — a web save deletes and reinserts
      //    rows, and Postgres keeps no tombstones. "Touched" games come from
      //    pulled lineup rows AND pulled game rows that have local lineup
      //    rows: the game_lineups tombstone trigger touches the parent
      //    game's updated_at on every lineup change, so even a web save that
      //    EMPTIES a lineup re-pulls the game and its deletions propagate.
      const { dirtyGameIds } = pulledDirtyState;
      const pulledLineups = (lineupsResult.data ?? []).filter(
        (r) => !dirtyGameIds.has(r.game_id),
      );
      const pulledGameIds = (gamesResult.data ?? []).map((g) => g.id);
      const gamesWithLocalLineups =
        pulledGameIds.length > 0
          ? (
              await database
                .get<GameLineup>('game_lineups')
                .query(Q.where('game_remote_id', Q.oneOf(pulledGameIds)))
                .fetch()
            ).map((r) => r.gameRemoteId)
          : [];
      const touchedGameIds = [
        ...new Set([...pulledLineups.map((r) => r.game_id), ...gamesWithLocalLineups]),
      ].filter((id) => !dirtyGameIds.has(id));
      let deletedLineupIds: string[] = [];
      if (touchedGameIds.length > 0) {
        const [serverIdsResult, localRows] = await Promise.all([
          supabase.from('game_lineups').select('id').in('game_id', touchedGameIds),
          database
            .get<GameLineup>('game_lineups')
            .query(Q.where('game_remote_id', Q.oneOf(touchedGameIds)))
            .fetch(),
        ]);
        if (serverIdsResult.error) throw serverIdsResult.error;
        deletedLineupIds = computeLineupDeletes(
          (serverIdsResult.data ?? []).map((r) => r.id),
          localRows.map((r) => r.id),
        );
      }

      // Server-side deletions (H3) — gated behind a cadence, not run every
      // cycle (see DELETION_RECONCILE_INTERVAL_MS above). `pullTimestamp` is
      // the server clock already captured above; using it here (rather than
      // the device clock) keeps the cadence consistent with the rest of this
      // pull even if the device clock is off.
      //
      // The whole attempt is wrapped: this is a best-effort cleanup step the
      // brief treats as optional (a stale row lingering is harmless), and it
      // must never be able to fail the entire sync cycle — which would also
      // block the push of queued offline events, since push runs after pull
      // inside synchronize() (round-1 review, Important 4). Every internal
      // failure path already degrades gracefully to "skip that table," but
      // this catches anything else (e.g. a WDB read throwing) and degrades
      // the whole cycle to "skip every table" rather than aborting the pull.
      let deletions = EMPTY_DELETIONS;
      if (shouldReconcileDeletions(pullTimestamp, lastDeletionReconcileAt)) {
        lastDeletionReconcileAt = pullTimestamp;
        try {
          deletions = await reconcileServerDeletions(supabase, userId);
        } catch (err) {
          console.warn(
            'sync: deletion reconciliation failed; skipping all deletions this cycle',
            err,
          );
        }
      }

      // Every pulled row goes in `updated`, never `created`.
      //
      // The pull is a timestamp window (`gte(updated_at, since)`) — it cannot
      // tell a row born since the last sync from one merely edited since, and
      // it re-delivers rows the device itself just pushed (their server-set
      // synced_at lands inside the window). Reporting those as `created` makes
      // WatermelonDB log "Server wants client to create record X, but it
      // already exists locally… could be a serious bug" for every echoed row,
      // burying real diagnostics. `updated` is the documented shape for a
      // backend that can't distinguish the two: WDB updates the row when it
      // exists and creates it when it doesn't. `sendCreatedAsUpdated` below
      // tells it we mean this, silencing the mirror-image warning.
      return {
        changes: {
          games: {
            created: [],
            updated: (gamesResult.data ?? []).map(mapGame),
            deleted: deletions.games,
          },
          game_events: {
            created: [],
            updated: (eventsResult.data ?? []).map(mapGameEvent),
            deleted: deletions.gameEvents,
          },
          players: {
            created: [],
            updated: [...playerRowsById.values()].map(mapPlayer),
            deleted: deletions.players,
          },
          channels: {
            created: [],
            updated: (channelsResult.data ?? []).map(mapChannel),
            deleted: deletions.channels,
          },
          messages: {
            created: [],
            updated: (messagesResult.data ?? []).map(mapMessage),
            deleted: deletions.messages,
          },
          game_lineups: {
            created: [],
            updated: pulledLineups.map(mapGameLineup),
            deleted: deletedLineupIds,
          },
          league_players: {
            created: [],
            updated: (leaguePlayersResult.data ?? []).map(mapLeaguePlayer),
            deleted: deletions.leaguePlayers,
          },
          opponent_players: {
            created: [],
            updated: (oppPlayersResult.data ?? []).map(mapOpponentPlayer),
            deleted: deletions.opponentPlayers,
          },
          opponent_game_lineups: {
            created: [],
            updated: oppLineupRows.map(mapOpponentGameLineup),
            deleted: deletedOppLineupIds,
          },
        },
        timestamp: pullTimestamp,
      };
    },

    pushChanges: async ({ changes }: SyncPushArgs) => {
      // SyncDatabaseChangeSet in this codebase's @nozbe/watermelondb types
      // does not declare our tables, so we cast through unknown.
      const tableChanges = changes as unknown as Record<
        string,
        {
          created?: Array<Record<string, unknown>>;
          updated?: Array<Record<string, unknown>>;
          deleted?: string[];
        }
      >;

      // Push order: game events FIRST — they're the live-game lifeline
      // (parents' live scores, pitch counts) and must never be starved by a
      // lineup or guest failure. Then guest players before league_players and
      // lineups (both FK to players); their errors are collected and thrown
      // at the END so a poisoned row can't block the other steps while WDB
      // still keeps everything unsynced for retry (the events upsert is
      // idempotent, so re-pushing next cycle is safe). Messages go LAST,
      // after the deferred throw — their insert is NOT idempotent, so they
      // must not run in a cycle that is already destined to fail and retry.

      // 1. Push locally-created game events (the main offline use case).
      const createdEvents = tableChanges.game_events?.created ?? [];
      if (createdEvents.length > 0) {
        // Skip events whose payload can't be parsed rather than aborting the
        // whole sync. Offenders are dead-lettered below — their rows remain
        // in WatermelonDB for inspection but are not retried, so one corrupt
        // payload can't wedge the queue for every other event.
        const skippedIds: string[] = [];
        const pushablePayloads = createdEvents
          .map((e) => {
            const payload = safeParsePayload(e.payload as string);
            if (payload === null) {
              // A row corrupt enough to have an unparseable payload may also
              // be missing its remote_id, so fall back to the WDB id — an
              // empty string in the register would be useless for tracking
              // the offender down later.
              skippedIds.push((e.remote_id as string) || `wdb:${e.id as string}`);
              return null;
            }
            return {
              id: e.remote_id as string,
              game_id: e.game_remote_id as string,
              sequence_number: e.sequence_number as number,
              event_type: e.event_type as string,
              inning: e.inning as number,
              is_top_of_inning: e.is_top_of_inning as boolean,
              payload,
              occurred_at: new Date(e.occurred_at as number).toISOString(),
              created_by: e.created_by as string,
              device_id: e.device_id as string,
            };
          })
          .filter((p) => p !== null);

        if (pushablePayloads.length > 0) {
          const { error } = await supabase.from('game_events').upsert(
            pushablePayloads,
            { onConflict: 'id', ignoreDuplicates: true },
          );

          if (error) {
            // Sequence number collision — another device already used these
            // sequence numbers for the same game. Renumber the local WDB
            // records so they start above the server's current max, then
            // throw so WatermelonDB leaves them in the unsynced queue; the
            // next sync cycle will push the renumbered events.
            if (error.code === '23505') {
              await reconcileSequenceNumbers(createdEvents, supabase);
              throw new Error('sync: seq-num collision; renumbered locally, will retry');
            }
            throw error;
          }
          // Parseable events (incl. game_start/game_end, whose payloads are
          // always parseable) are now committed server-side, even if the
          // skipped-payload guard below throws for other rows.
          eventsPushed = true;
        }

        // Rows with unparseable payloads are dead-lettered, not retried.
        // JSON.parse fails deterministically, so throwing here to keep them
        // unsynced only produced an infinite retry loop that also blocked
        // every healthy event in the batch from ever settling. Record them
        // and let the cycle succeed; the local rows are untouched and can be
        // inspected via getQuarantinedEventIds().
        if (skippedIds.length > 0) {
          await quarantineEventIds(skippedIds);
          console.warn(
            `sync: dead-lettered ${skippedIds.length} event(s) with unparseable payloads; ` +
              `they will not be retried: ${skippedIds.slice(0, 3).join(', ')}${skippedIds.length > 3 ? '…' : ''}`,
          );
        }
      }

      // Steps 2-4 collect failures instead of throwing immediately: a single
      // poisoned guest row or lineup game must not abort the cycle before the
      // other lineup games push. The aggregate throw at the end still fails
      // the cycle so WDB leaves everything unsynced and retries.
      const deferredErrors: string[] = [];

      // 2. Guest players created offline. Mobile only ever creates guest-only
      // identities; filter defensively so a pulled roster row can never leak
      // into an insert. Client UUID becomes the server PK, like game_events.
      // No ignoreDuplicates: a retried cycle may carry newer name/jersey
      // values on a still-'created' row (e.g. the coach edited the guest
      // after an earlier push inserted it but the cycle later failed) — the
      // conflict path must merge, not no-op, or the edit is silently lost.
      const createdGuests = (tableChanges.players?.created ?? []).filter(
        (p) => p.is_guest_only === true,
      );
      if (createdGuests.length > 0) {
        const { error } = await supabase.from('players').upsert(
          createdGuests.map((p) => ({
            id: p.remote_id as string,
            team_id: null,
            first_name: p.first_name as string,
            last_name: p.last_name as string,
            jersey_number: (p.jersey_number as number | null) ?? null,
            is_guest_only: true,
            is_active: true,
          })),
          { onConflict: 'id' },
        );
        if (error) deferredErrors.push(`guest players upsert: ${error.message}`);
      }

      // Guest identity edits (e.g. jersey fixes) — allowed by RLS only for
      // guest-only rows, so filter to those.
      const updatedGuests = (tableChanges.players?.updated ?? []).filter(
        (p) => p.is_guest_only === true,
      );
      for (const p of updatedGuests) {
        const { error } = await supabase
          .from('players')
          .update({
            first_name: p.first_name as string,
            last_name: p.last_name as string,
            jersey_number: (p.jersey_number as number | null) ?? null,
          })
          .eq('id', p.remote_id as string);
        if (error) {
          deferredErrors.push(`guest player update ${p.remote_id}: ${error.message}`);
        }
      }

      // 3. League guest-pool registrations created offline.
      const createdLeaguePlayers = tableChanges.league_players?.created ?? [];
      if (createdLeaguePlayers.length > 0) {
        const { error } = await supabase.from('league_players').upsert(
          createdLeaguePlayers.map((lp) => ({
            league_id: lp.league_id as string,
            player_id: lp.player_remote_id as string,
          })),
          { onConflict: 'league_id,player_id', ignoreDuplicates: true },
        );
        if (error) deferredErrors.push(`league_players upsert: ${error.message}`);
      }

      // 3b. Opponent players added at the field. RLS lets a coach on the
      // game's team insert these directly, so there is no server action in
      // the path and the whole flow works offline. Client UUID becomes the
      // server PK, like game_events. Upsert without ignoreDuplicates so a
      // name or jersey corrected after a partial push still merges.
      const createdOppPlayers = tableChanges.opponent_players?.created ?? [];
      const updatedOppPlayers = tableChanges.opponent_players?.updated ?? [];
      const oppPlayerWrites = [...createdOppPlayers, ...updatedOppPlayers];
      if (oppPlayerWrites.length > 0) {
        const { error } = await supabase.from('opponent_players').upsert(
          oppPlayerWrites.map((p) => ({
            id: p.remote_id as string,
            opponent_team_id: p.opponent_team_id as string,
            first_name: p.first_name as string,
            last_name: p.last_name as string,
            jersey_number: (p.jersey_number as string | null) || null,
            primary_position: ((p.primary_position as string | null) || null) as PlayerPosition | null,
            is_active: (p.is_active as boolean | undefined) ?? true,
          })),
          { onConflict: 'id' },
        );
        if (error) deferredErrors.push(`opponent_players upsert: ${error.message}`);
      }

      // 3c. Opponent batting order. Must follow 3b — opponent_player_id is a
      // foreign key, and a batter added mid-game pushes both rows in the same
      // cycle. unique(game_id, opponent_player_id) means a re-slotted batter
      // conflicts on that pair rather than on id, so target it explicitly.
      const oppLineupWrites = [
        ...(tableChanges.opponent_game_lineups?.created ?? []),
        ...(tableChanges.opponent_game_lineups?.updated ?? []),
      ];
      if (oppLineupWrites.length > 0) {
        const { error } = await supabase.from('opponent_game_lineups').upsert(
          oppLineupWrites.map((l) => ({
            id: l.remote_id as string,
            game_id: l.game_remote_id as string,
            opponent_player_id: l.opponent_player_remote_id as string,
            batting_order: (l.batting_order as number | null) ?? null,
            starting_position: ((l.starting_position as string | null) || null) as PlayerPosition | null,
            is_starter: (l.is_starter as boolean | undefined) ?? true,
          })),
          { onConflict: 'game_id,opponent_player_id' },
        );
        if (error) deferredErrors.push(`opponent_game_lineups upsert: ${error.message}`);
      }

      const deletedOppLineups = tableChanges.opponent_game_lineups?.deleted ?? [];
      if (deletedOppLineups.length > 0) {
        const { error } = await supabase
          .from('opponent_game_lineups')
          .delete()
          .in('id', deletedOppLineups);
        if (error) deferredErrors.push(`opponent_game_lineups delete: ${error.message}`);
      }

      // 4. Lineups — per-game whole-lineup replace, guarded by the conflict
      // policy in @baseball/shared (mobile wins live, LWW pre-game). Reuses
      // the dirty state computed during this cycle's pull; the deleted bucket
      // in `changes` carries only ids, not the game they belonged to, which
      // is why dirty detection lives in getDirtyLineupState.
      const { dirtyGameIds, localEditedAtMsByGame } =
        dirtyLineupState ?? (await getDirtyLineupState(database));
      for (const gameRemoteId of dirtyGameIds) {
        try {
          const result = await pushLineupsForGame(
            supabase,
            database,
            gameRemoteId,
            localEditedAtMsByGame.get(gameRemoteId) ?? 0,
          );
          if (result === 'skipped') skippedLineupGames.push(gameRemoteId);
        } catch (err) {
          deferredErrors.push(
            `lineup push game=${gameRemoteId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (deferredErrors.length > 0) {
        throw new Error(`sync: deferred push failures — ${deferredErrors.join('; ')}`);
      }

      // 5. Push locally-created messages. Last and after the deferred throw:
      // this insert is not idempotent, so it must only run in a cycle that
      // will be marked complete (otherwise retries would duplicate messages).
      const createdMessages = tableChanges.messages?.created ?? [];
      if (createdMessages.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('messages').insert(
          createdMessages.map((m) => ({
            id: m.remote_id as string,
            channel_id: m.channel_remote_id as string,
            sender_id: user?.id ?? '',
            body: m.body as string,
            parent_id: m.parent_id as string | undefined,
          })),
        );
        if (error) throw error;
      }
    },

    // Our pull is a timestamp window and cannot separate created from
    // updated, so it reports everything as `updated` (see pullChanges).
    sendCreatedAsUpdated: true,
    migrationsEnabledAtVersion: 1,
  });
  syncOk = true;

  // Converge games whose lineup push deferred to the server (LWW skip).
  // WatermelonDB marked their local rows synced, so replace them with the
  // server rows here. Never throw. On failure, re-dirty the game's local
  // rows so the retry survives app restarts via WDB's own _status markers
  // (re-dirtied rows re-enter the push path: LWW skips against the newer
  // server again → snapshot retried; in-progress games push mobile-wins,
  // which is the policy anyway). The in-memory pendingSnapshotGames set
  // covers the corner where the game has no local rows to re-dirty.
  const snapshotGames = new Set([...skippedLineupGames, ...pendingSnapshotGames]);
  for (const gameRemoteId of snapshotGames) {
    try {
      await applyServerLineupSnapshot(database, supabase, gameRemoteId);
      pendingSnapshotGames.delete(gameRemoteId);
    } catch (err) {
      pendingSnapshotGames.add(gameRemoteId);
      console.warn('sync: failed to apply server lineup snapshot; will retry', gameRemoteId, err);
      try {
        await redirtyLineupRows(gameRemoteId);
      } catch (redirtyErr) {
        console.warn('sync: failed to re-dirty lineup rows', gameRemoteId, redirtyErr);
      }
    }
  }
  } finally {
    // Reconcile game lifecycle transitions (scheduled → in_progress →
    // completed) against the server. Runs when the cycle succeeded OR when the
    // event push reached the server but a later deferred step (lineup/guest)
    // failed the cycle — game_events are pushed first, so a lineup error must
    // not starve start/finalize. Skipped only when the event push itself
    // failed (eventsPushed false and the cycle threw), so a game is never
    // finalized before its events reach the server. Never throws.
    if (syncOk || eventsPushed) {
      try {
        await reconcileGameLifecycle(supabase);
      } catch (err) {
        console.warn('sync: game lifecycle reconciliation failed; will retry', err);
      }
    }
  }
}

// Games this session has already confirmed as completed on the server —
// skipped on later scans to keep the per-cycle status query small. In-memory
// only: a restart re-confirms with one query (idempotent).
const lifecycleReconciledGames = new Set<string>();

// Set once the missing-EXPO_PUBLIC_API_BASE_URL warning has fired, so a
// misconfigured build logs it once instead of once per sync cycle forever.
let warnedMissingApiBase = false;

// Consecutive finalize-call failures (non-2xx response or thrown fetch) per
// game id, since the last success. Reset to 0 (deleted) the moment a
// finalize call for that game succeeds. This is the signal that lets the UI
// tell "just needs time" (a handful of failures, or none yet) apart from
// "will never happen without a human" (failing every cycle for a while) —
// see `describeFinalizeStatus` in `./finalize-status`, which is what
// actually renders on that count.
const finalizeFailureCounts = new Map<string, number>();

// Game ids for which a finalize-call failure has already been logged once.
// Mirrors `warnedMissingApiBase`'s one-shot shape, but per-game rather than
// global: unlike the missing-config case (fixed only by a rebuild, i.e. a
// fresh process), a per-game HTTP/network failure can plausibly start
// succeeding again without a restart, so latching per-game rather than for
// the whole process still lets a *different* game's failures be seen, while
// stopping the identical warning from spamming every ~30s for the same one.
const warnedFinalizeFailureGames = new Set<string>();

/**
 * Consecutive finalize-call failures recorded for a game, for UI copy that
 * needs to distinguish "still waiting" from "stuck." 0 if no failures have
 * been recorded (either nothing attempted yet, or the last attempt for this
 * game succeeded).
 */
export function getFinalizeFailureCount(gameId: string): number {
  return finalizeFailureCounts.get(gameId) ?? 0;
}

/**
 * True when the app can reach the finalize endpoint at all.
 *
 * `apiBaseUrl` is normally omitted — real callers rely on the default, which
 * reads `EXPO_PUBLIC_API_BASE_URL`. Expo's babel preset inlines
 * `EXPO_PUBLIC_*` vars into a literal at build time, so a test process cannot
 * change `process.env.EXPO_PUBLIC_API_BASE_URL` and observe a different
 * result; the parameter exists so tests can exercise both branches directly.
 */
export function isFinalizeConfigured(
  apiBaseUrl: string | undefined = process.env.EXPO_PUBLIC_API_BASE_URL,
): boolean {
  return !!apiBaseUrl;
}

/**
 * Server-side game lifecycle reconciliation, run after each sync cycle.
 *
 * Stateless, idempotent scan of the local event log:
 *   - a (non-voided) local game_start for a game the server still has as
 *     'scheduled' → rpc fn_start_game (SECURITY DEFINER coach check);
 *   - a (non-voided) local game_end for a game the server has not completed
 *     → POST /api/games/:id/finalize (runs the same finalizeGame as the web
 *     End Game action: status/scores, dual-scorekeeper reconciliation,
 *     league snapshot recompute).
 *
 * The mobile app cannot write the games table (RLS) nor run the web's
 * TypeScript finalization, which is why both transitions go server-side.
 */
async function reconcileGameLifecycle(
  supabase: ReturnType<typeof getSupabaseClient>,
): Promise<void> {
  const lifecycleEvents = await database
    .get<GameEvent>('game_events')
    .query(Q.where('event_type', Q.oneOf(['game_start', 'game_end', 'event_voided'])))
    .fetch();
  if (lifecycleEvents.length === 0) return;

  // Respect undo: a voided game_start / game_end must not transition the game.
  const voidedIds = new Set<string>();
  for (const e of lifecycleEvents) {
    if (e.eventType !== 'event_voided') continue;
    const p = e.payload as { voidedEventId?: string };
    if (p.voidedEventId) voidedIds.add(p.voidedEventId);
  }

  const startedGames = new Set<string>();
  const endEventByGame = new Map<string, GameEvent>();
  for (const e of lifecycleEvents) {
    if (voidedIds.has(e.remoteId)) continue;
    if (e.eventType === 'game_start') startedGames.add(e.gameRemoteId);
    else if (e.eventType === 'game_end') endEventByGame.set(e.gameRemoteId, e);
  }

  const candidates = [...new Set([...startedGames, ...endEventByGame.keys()])].filter(
    (id) => !lifecycleReconciledGames.has(id),
  );
  if (candidates.length === 0) return;

  const { data: serverGames, error } = await supabase
    .from('games')
    .select('id, status')
    .in('id', candidates);
  if (error) {
    console.warn('sync: lifecycle status query failed', error);
    return;
  }

  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  let accessToken: string | null = null;

  for (const g of serverGames ?? []) {
    const status = g.status as string;

    // Terminal on the server — nothing left to reconcile this session.
    if (status === 'completed' || status === 'cancelled') {
      lifecycleReconciledGames.add(g.id as string);
      continue;
    }

    if (status === 'scheduled' && startedGames.has(g.id as string)) {
      const { error: startErr } = await supabase.rpc('fn_start_game', {
        p_game_id: g.id as string,
      });
      if (startErr) {
        console.warn('sync: fn_start_game failed', g.id, startErr.message);
        continue; // retry next cycle
      }
    }

    const endEvent = endEventByGame.get(g.id as string);
    if (!endEvent) continue;

    if (!apiBaseUrl) {
      if (!warnedMissingApiBase) {
        warnedMissingApiBase = true;
        console.warn(
          'sync: EXPO_PUBLIC_API_BASE_URL is not set — completed games cannot finalize',
        );
      }
      continue;
    }
    if (accessToken === null) {
      const { data: sessionData } = await supabase.auth.getSession();
      accessToken = sessionData.session?.access_token ?? '';
      if (!accessToken) {
        console.warn('sync: no session token for game finalize; will retry');
        return;
      }
    }

    try {
      const payload = endEvent.payload as { homeScore?: number; awayScore?: number };
      const res = await fetch(`${apiBaseUrl}/api/games/${g.id}/finalize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          homeScore: payload.homeScore ?? 0,
          awayScore: payload.awayScore ?? 0,
          inning: endEvent.inning,
          isTopOfInning: endEvent.isTopOfInning,
          deviceId: endEvent.deviceId,
        }),
      });
      if (res.ok) {
        lifecycleReconciledGames.add(g.id as string);
        finalizeFailureCounts.delete(g.id as string);
        warnedFinalizeFailureGames.delete(g.id as string);
      } else {
        const gameKey = g.id as string;
        finalizeFailureCounts.set(gameKey, (finalizeFailureCounts.get(gameKey) ?? 0) + 1);
        if (!warnedFinalizeFailureGames.has(gameKey)) {
          warnedFinalizeFailureGames.add(gameKey);
          const body = await res.text().catch(() => '');
          console.warn(
            'sync: finalize call failed; will retry silently after this first warning',
            gameKey,
            res.status,
            body,
          );
        }
      }
    } catch (err) {
      const gameKey = g.id as string;
      finalizeFailureCounts.set(gameKey, (finalizeFailureCounts.get(gameKey) ?? 0) + 1);
      if (!warnedFinalizeFailureGames.has(gameKey)) {
        warnedFinalizeFailureGames.add(gameKey);
        console.warn(
          'sync: finalize call errored; will retry silently after this first warning',
          gameKey,
          err,
        );
      }
    }
  }
}

/**
 * Mark a game's synced local lineup rows as locally modified so a failed
 * server-snapshot convergence is retried on future cycles even across app
 * restarts (the in-memory retry set alone would be lost).
 */
async function redirtyLineupRows(gameRemoteId: string): Promise<void> {
  const rows = await database
    .get<GameLineup>('game_lineups')
    .query(Q.where('game_remote_id', gameRemoteId))
    .fetch();
  const syncedRows = rows.filter((row) => row.syncStatus === 'synced');
  if (syncedRows.length === 0) return;
  await database.write(async () => {
    await database.batch(
      ...syncedRows.map((row) =>
        row.prepareUpdate((r) => {
          // Raw escape hatch: flip the sync status without changing values,
          // so the row re-enters the dirty set the push path scans.
          r._raw._status = 'updated';
        }),
      ),
    );
  });
}

// ─── mapping helpers ─────────────────────────────────────────────────────────

function mapGame(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    season_id: r.season_id,
    team_id: r.team_id,
    // Coerce TBD opponents (NULL on the server) to '' so the WatermelonDB
    // schema can keep its required-string column. Display sites render an
    // empty value as 'TBD'.
    opponent_name: r.opponent_name ?? '',
    opponent_team_id: r.opponent_team_id ?? null,
    scheduled_at: new Date(r.scheduled_at as string).getTime(),
    location_type: r.location_type,
    neutral_home_team: r.neutral_home_team ?? null,
    venue_name: r.venue_name ?? null,
    status: r.status,
    home_score: r.home_score,
    away_score: r.away_score,
    current_inning: r.current_inning,
    is_top_of_inning: r.is_top_of_inning,
    outs: r.outs,
    synced_at: Date.now(),
  };
}

function mapGameEvent(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    game_id: null,       // Will be resolved by WDB join on game_remote_id
    game_remote_id: r.game_id,
    sequence_number: r.sequence_number,
    event_type: r.event_type,
    inning: r.inning,
    is_top_of_inning: r.is_top_of_inning,
    payload: JSON.stringify(r.payload),
    occurred_at: new Date(r.occurred_at as string).getTime(),
    created_by: r.created_by,
    device_id: r.device_id,
    synced_at: Date.now(),
  };
}

function mapPlayer(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    team_id: r.team_id ?? null,   // NULL for guest-only identities
    first_name: r.first_name,
    last_name: r.last_name,
    jersey_number: r.jersey_number ?? null,
    primary_position: r.primary_position ?? null,
    bats: r.bats ?? null,
    throws: r.throws ?? null,
    is_active: r.is_active,
    is_guest_only: r.is_guest_only ?? false,
    synced_at: Date.now(),
  };
}

function mapGameLineup(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    game_remote_id: r.game_id,
    player_remote_id: r.player_id,
    batting_order: r.batting_order ?? null,
    starting_position: r.starting_position ?? null,
    is_starter: r.is_starter,
    is_guest: r.is_guest,
    guest_display_name: r.guest_display_name ?? null,
    count_toward_stats: r.count_toward_stats,
    updated_at: new Date(r.updated_at as string).getTime(),
    synced_at: Date.now(),
  };
}

function mapLeaguePlayer(r: Record<string, unknown>) {
  // Composite server PK flattened into the WDB record id; local creation
  // uses the same form (leaguePlayerRecordId) so upsert echoes merge by id.
  return {
    id: `${r.league_id}:${r.player_id}`,
    league_id: r.league_id,
    player_remote_id: r.player_id,
    registered_at: new Date(r.registered_at as string).getTime(),
    synced_at: Date.now(),
  };
}

function mapOpponentPlayer(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    opponent_team_id: r.opponent_team_id,
    first_name: r.first_name,
    last_name: r.last_name,
    // Server column is text; coerce so a numeric-looking jersey still lands
    // in a string column rather than tripping WatermelonDB's sanitizer.
    jersey_number: r.jersey_number == null ? null : String(r.jersey_number),
    primary_position: r.primary_position ?? null,
    is_active: r.is_active ?? true,
    updated_at: r.updated_at ? new Date(r.updated_at as string).getTime() : Date.now(),
    synced_at: Date.now(),
  };
}

function mapOpponentGameLineup(r: Record<string, unknown>) {
  return {
    id: r.id,
    remote_id: r.id,
    game_remote_id: r.game_id,
    opponent_player_remote_id: r.opponent_player_id,
    batting_order: r.batting_order ?? null,
    starting_position: r.starting_position ?? null,
    is_starter: r.is_starter ?? true,
    // No updated_at server-side — this column is device bookkeeping, so
    // stamp it at pull time.
    updated_at: Date.now(),
    synced_at: Date.now(),
  };
}

function mapChannel(r: Record<string, unknown>) {
  // channel_members is filtered to the current user in the pull query
  const members = (r.channel_members as Array<{ can_post: boolean }>) ?? [];
  return {
    id: r.id,
    remote_id: r.id,
    team_id: r.team_id,
    channel_type: r.channel_type,
    name: r.name ?? null,
    description: r.description ?? null,
    can_post: members[0]?.can_post ?? false,
    synced_at: Date.now(),
  };
}

function mapMessage(r: Record<string, unknown>) {
  const profile = r.user_profiles as { first_name: string; last_name: string } | null;
  return {
    id: r.id,
    remote_id: r.id,
    channel_id: null,   // Resolved by WDB join on channel_remote_id
    channel_remote_id: r.channel_id,
    sender_id: r.sender_id,
    sender_name: profile ? `${profile.first_name} ${profile.last_name}` : null,
    body: r.body,
    parent_id: r.parent_id ?? null,
    is_pinned: r.is_pinned,
    created_at: new Date(r.created_at as string).getTime(),
    synced_at: Date.now(),
  };
}
