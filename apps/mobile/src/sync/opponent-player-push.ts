import type { PlayerPosition } from '@baseball/shared';

/**
 * Pushes the opponent players added or edited on the device (sync step 3b).
 *
 * RLS lets a scorer write a league game's placeholder only while it is still
 * unmatched (`league_game_scorers_edit_placeholders`). Once the server matches
 * it to a roster player or marks it a fill-in, a re-push of the device's copy
 * (a rename made offline, or a created row whose earlier push half-failed) is
 * refused — and because the rows go up in one statement, that one refusal
 * would fail every other row with it, cycle after cycle, along with the
 * opponent batting order that references them.
 *
 * So:
 * - a placeholder the device already knows is resolved (the pull brought the
 *   server's link or fill-in flag) is not sent; the device can never change
 *   it again;
 * - on a row-level-security refusal the batch is retried row by row: a
 *   refused placeholder is dropped (WatermelonDB marks it synced when the
 *   cycle ends and the server's version is what the device reads next), the
 *   other rows still push, and a refused ordinary row is still an error;
 * - any other error fails the push as before.
 *
 * Not `ignoreDuplicates`: a created row re-pushed after a half-failed cycle
 * may carry a rename made since, which a do-nothing conflict would lose.
 */

export interface OpponentPlayerWrite {
  id: string;
  opponent_team_id: string;
  first_name: string;
  last_name: string;
  jersey_number: string | null;
  primary_position: PlayerPosition | null;
  is_active: boolean;
  placeholder_game_id: string | null;
}

export interface PushError {
  code?: string;
  message: string;
}

export type OpponentPlayerUpsert = (
  writes: OpponentPlayerWrite[],
) => PromiseLike<{ error: PushError | null }>;

export interface OpponentPlayerPushResult {
  /** Failures for the cycle's deferred errors; empty when the push succeeded. */
  errors: string[];
  /** Placeholders not written because the server has already resolved them. */
  droppedIds: string[];
}

/**
 * The server row for an opponent player pushed from the device.
 * Every row carries placeholder_game_id, null for an ordinary opponent: one
 * upsert sends the union of its rows' keys and nulls a key a row lacks, so a
 * key sent only for some rows would clear it on the others. linked_player_id
 * and is_fill_in are maintained on the server and never sent.
 */
export function toOpponentPlayerWrite(p: Record<string, unknown>): OpponentPlayerWrite {
  return {
    id: p.remote_id as string,
    opponent_team_id: p.opponent_team_id as string,
    first_name: p.first_name as string,
    last_name: p.last_name as string,
    jersey_number: (p.jersey_number as string | null) || null,
    primary_position: ((p.primary_position as string | null) || null) as PlayerPosition | null,
    is_active: (p.is_active as boolean | undefined) ?? true,
    placeholder_game_id: (p.placeholder_game_id as string | null | undefined) || null,
  };
}

/** A placeholder the server has matched or marked a fill-in, as last pulled. */
export function isResolvedPlaceholder(p: Record<string, unknown>): boolean {
  if (!p.placeholder_game_id) return false;
  return Boolean(p.linked_player_id) || p.is_fill_in === true;
}

/** Postgres 42501, which PostgREST returns for a row-level security refusal. */
export function isRowLevelSecurityRefusal(error: PushError): boolean {
  return error.code === '42501' || /row-level security/i.test(error.message);
}

export async function pushOpponentPlayers(
  localRows: readonly Record<string, unknown>[],
  upsert: OpponentPlayerUpsert,
): Promise<OpponentPlayerPushResult> {
  const droppedIds: string[] = [];
  const writes: OpponentPlayerWrite[] = [];
  for (const row of localRows) {
    if (isResolvedPlaceholder(row)) droppedIds.push(row.remote_id as string);
    else writes.push(toOpponentPlayerWrite(row));
  }
  if (writes.length === 0) return { errors: [], droppedIds };

  const { error } = await upsert(writes);
  if (!error) return { errors: [], droppedIds };
  if (!isRowLevelSecurityRefusal(error)) {
    return { errors: [`opponent_players upsert: ${error.message}`], droppedIds };
  }

  const errors: string[] = [];
  for (const write of writes) {
    const { error: rowError } = await upsert([write]);
    if (!rowError) continue;
    if (write.placeholder_game_id && isRowLevelSecurityRefusal(rowError)) {
      console.warn(
        `sync: the server refused placeholder ${write.id} (matched, fill-in or no longer editable); keeping the server's version`,
      );
      droppedIds.push(write.id);
      continue;
    }
    errors.push(`opponent_players upsert ${write.id}: ${rowError.message}`);
  }
  return { errors, droppedIds };
}
