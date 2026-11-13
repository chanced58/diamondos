import { describeSyncError } from './sync-error';

/**
 * Pushes the guest players added on the device (sync steps 2 and 3).
 *
 * A guest added at the field ("Add batter" → new batter, `createLocalGuest`)
 * is a guest-only `players` row plus, in a league, a `league_players` row.
 * Scorers have INSERT rights on these and no SELECT on guest rows — on
 * purpose: other teams see guests only through `league_player_identities()`,
 * which leaves out every PII column. So:
 *
 * - New rows go up as plain INSERTs, and a duplicate key (23505: an earlier
 *   half-failed cycle already inserted it) counts as done. An upsert can't be
 *   used: any ON CONFLICT with an arbiter, DO NOTHING included, also checks
 *   the new row against the SELECT policies and is refused.
 * - An edited guest's name and jersey go up through `fn_update_guest_player`
 *   (a plain UPDATE … WHERE id would need SELECT too, and silently match
 *   nothing). A created guest that turned out to exist already is sent the
 *   same way, since the device may hold an edit made after the first insert.
 *   The RPC says whether it changed a row; when it didn't, the edit is
 *   reported as a failure so it stays unsynced and is retried.
 * - A refused statement is retried row by row, so one bad guest can't hold
 *   back the others. The guests still refused are returned as `failedIds`:
 *   their league registration and edit aren't attempted, and the lineup push
 *   leaves their rows out rather than failing the whole game's lineup on the
 *   missing player (see `lineupRowsToPush`).
 */

export interface PushError {
  code?: string;
  message: string;
}

export type PushResult = PromiseLike<{ error: PushError | null }>;

/** Postgres 23505: the row is already on the server. */
export function isDuplicateKey(error: PushError): boolean {
  return error.code === '23505';
}

export interface GuestPlayerWrite {
  id: string;
  team_id: null;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  is_guest_only: true;
  is_active: true;
}

export interface GuestLeagueRegistration {
  league_id: string;
  player_id: string;
}

export interface GuestPlayerFields {
  first_name: string;
  last_name: string;
  jersey_number: number | null;
}

export interface GuestPushWriters {
  /** Plain INSERT of players rows. */
  insertPlayers: (writes: GuestPlayerWrite[]) => PushResult;
  /** Plain INSERT of league_players rows. */
  registerInLeague: (writes: GuestLeagueRegistration[]) => PushResult;
  /** Set one guest's name and jersey; `changed` false when no row was written. */
  updatePlayer: (id: string, fields: GuestPlayerFields) => PromiseLike<{ changed: boolean; error: PushError | null }>;
}

export interface GuestPushResult {
  /** Failures for the cycle's deferred errors; empty when everything pushed. */
  errors: string[];
  /** Guest players the server still lacks after this push. */
  failedIds: Set<string>;
}

/** Local rows (WatermelonDB raw) that are guest identities. */
export function guestRows(rows: readonly Record<string, unknown>[] | undefined): Record<string, unknown>[] {
  return (rows ?? []).filter((p) => p.is_guest_only === true);
}

export function toGuestPlayerWrite(p: Record<string, unknown>): GuestPlayerWrite {
  return {
    id: p.remote_id as string,
    team_id: null,
    first_name: p.first_name as string,
    last_name: p.last_name as string,
    jersey_number: (p.jersey_number as number | null | undefined) ?? null,
    is_guest_only: true,
    is_active: true,
  };
}

function toGuestFields(p: Record<string, unknown>): GuestPlayerFields {
  return {
    first_name: p.first_name as string,
    last_name: p.last_name as string,
    jersey_number: (p.jersey_number as number | null | undefined) ?? null,
  };
}

/**
 * Insert `writes` in one statement; if it is refused, insert them one at a
 * time. A row whose key is already on the server is done (`existing`); the
 * rest still refused are `failed`.
 */
async function insertEachOnFailure<T>(
  writes: T[],
  insert: (batch: T[]) => PushResult,
  describe: (row: T) => string,
  label: string,
): Promise<{ errors: string[]; failed: T[]; existing: T[] }> {
  const done = { errors: [] as string[], failed: [] as T[], existing: [] as T[] };
  if (writes.length === 0) return done;
  const { error } = await insert(writes);
  if (!error) return done;
  for (const row of writes) {
    const { error: rowError } = writes.length === 1 ? { error } : await insert([row]);
    if (!rowError) continue;
    if (isDuplicateKey(rowError)) {
      done.existing.push(row);
      continue;
    }
    done.failed.push(row);
    done.errors.push(`${label} ${describe(row)}: ${describeSyncError(rowError)}`);
  }
  return done;
}

export async function pushGuestPlayers(
  created: readonly Record<string, unknown>[],
  updated: readonly Record<string, unknown>[],
  createdLeagueRegistrations: readonly Record<string, unknown>[],
  writers: GuestPushWriters,
): Promise<GuestPushResult> {
  const playerInsert = await insertEachOnFailure(
    created.map(toGuestPlayerWrite),
    writers.insertPlayers,
    (row) => row.id,
    'guest player insert',
  );
  const failedIds = new Set(playerInsert.failed.map((row) => row.id));
  const alreadyThere = new Set(playerInsert.existing.map((row) => row.id));
  const errors = [...playerInsert.errors];

  const registrations = createdLeagueRegistrations
    .map((lp) => ({ league_id: lp.league_id as string, player_id: lp.player_remote_id as string }))
    .filter((lp) => !failedIds.has(lp.player_id));
  const registration = await insertEachOnFailure(
    registrations,
    writers.registerInLeague,
    (row) => `${row.league_id}/${row.player_id}`,
    'league_players insert',
  );
  errors.push(...registration.errors);

  // A guest this cycle just inserted already carries the device's values.
  const edits = [...created.filter((p) => alreadyThere.has(p.remote_id as string)), ...updated];
  for (const p of edits) {
    const id = p.remote_id as string;
    if (failedIds.has(id)) continue;
    const { changed, error } = await writers.updatePlayer(id, toGuestFields(p));
    if (error) errors.push(`guest player update ${id}: ${describeSyncError(error)}`);
    else if (!changed) errors.push(`guest player update ${id}: not stored (not a guest in one of your leagues)`);
  }

  return { errors, failedIds };
}
