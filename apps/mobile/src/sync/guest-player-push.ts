import { describeSyncError } from './sync-error';

/**
 * Pushes the guest players added on the device (sync steps 2 and 3).
 *
 * A guest added at the field ("Add batter" → new batter, `createLocalGuest`)
 * is a guest-only `players` row plus, in a league, a `league_players` row.
 *
 * - New guests go up as insert-and-ignore-duplicates. An upsert that merges
 *   (`ON CONFLICT DO UPDATE`) also needs SELECT and UPDATE rights on the
 *   existing row, and a scorer has neither on a guest identity — on purpose:
 *   other teams see guests only through `league_player_identities()`, which
 *   leaves out every PII column. Insert rights alone admit a do-nothing
 *   conflict, so a row an earlier half-failed cycle already inserted is
 *   simply skipped.
 * - Names and jerseys then go up as a plain UPDATE, for edited guests and for
 *   created ones too: a created row re-pushed after a half-failed cycle may
 *   carry an edit made since, which the do-nothing insert would lose. RLS
 *   lets the update through once the guest is registered in one of the
 *   scorer's leagues; otherwise it matches no row and changes nothing.
 * - A refused statement is retried row by row, so one bad guest can't hold
 *   back the others. The guests still refused are returned as `failedIds`:
 *   their league registration isn't attempted (it would fail on them), and
 *   the lineup push leaves their rows out rather than failing the whole
 *   game's lineup on the missing player (see `lineupRowsToPush`).
 */

export interface PushError {
  code?: string;
  message: string;
}

export type PushResult = PromiseLike<{ error: PushError | null }>;

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
  /** Insert players rows, ignoring ones that already exist. */
  insertPlayers: (writes: GuestPlayerWrite[]) => PushResult;
  /** Insert league_players rows, ignoring ones that already exist. */
  registerInLeague: (writes: GuestLeagueRegistration[]) => PushResult;
  /** Update one guest's name and jersey. */
  updatePlayer: (id: string, fields: GuestPlayerFields) => PushResult;
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
 * Write `writes` in one statement; if it is refused, write them one at a time
 * and report the ones still refused.
 */
async function writeEachOnFailure<T>(
  writes: T[],
  write: (batch: T[]) => PushResult,
  describe: (row: T) => string,
  label: string,
): Promise<{ errors: string[]; failed: T[] }> {
  if (writes.length === 0) return { errors: [], failed: [] };
  const { error } = await write(writes);
  if (!error) return { errors: [], failed: [] };
  if (writes.length === 1) {
    return { errors: [`${label} ${describe(writes[0])}: ${describeSyncError(error)}`], failed: writes };
  }
  const errors: string[] = [];
  const failed: T[] = [];
  for (const row of writes) {
    const { error: rowError } = await write([row]);
    if (!rowError) continue;
    failed.push(row);
    errors.push(`${label} ${describe(row)}: ${describeSyncError(rowError)}`);
  }
  return { errors, failed };
}

export async function pushGuestPlayers(
  created: readonly Record<string, unknown>[],
  updated: readonly Record<string, unknown>[],
  createdLeagueRegistrations: readonly Record<string, unknown>[],
  writers: GuestPushWriters,
): Promise<GuestPushResult> {
  const playerInsert = await writeEachOnFailure(
    created.map(toGuestPlayerWrite),
    writers.insertPlayers,
    (row) => row.id,
    'guest player insert',
  );
  const failedIds = new Set(playerInsert.failed.map((row) => row.id));
  const errors = [...playerInsert.errors];

  const registrations = createdLeagueRegistrations
    .map((lp) => ({ league_id: lp.league_id as string, player_id: lp.player_remote_id as string }))
    .filter((lp) => !failedIds.has(lp.player_id));
  const registration = await writeEachOnFailure(
    registrations,
    writers.registerInLeague,
    (row) => `${row.league_id}/${row.player_id}`,
    'league_players insert',
  );
  errors.push(...registration.errors);

  for (const p of [...created, ...updated]) {
    const id = p.remote_id as string;
    if (failedIds.has(id)) continue;
    const { error } = await writers.updatePlayer(id, toGuestFields(p));
    if (error) errors.push(`guest player update ${id}: ${describeSyncError(error)}`);
  }

  return { errors, failedIds };
}
