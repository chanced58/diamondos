import { randomUUID } from 'expo-crypto';
import { Q, type Model } from '@nozbe/watermelondb';
import { database, GameLineup, LeaguePlayer, Player } from '../../db';
import { leaguePlayerRecordId } from '../../db/models/LeaguePlayer';

/**
 * Offline-first guest and lineup-row writes. Everything lands in WatermelonDB
 * and reaches Supabase through the sync engine (players/league_players push
 * before game_lineups, satisfying the FKs). Replaces the online-only guest
 * flow that failed RLS silently for ordinary coaches.
 */

export type LocalLineupWriteResult =
  | { ok: true; playerRemoteId: string; battingOrder: number }
  | { ok: false; message: string };

async function nextBattingOrder(
  gameRemoteId: string,
  maxBatters: number,
): Promise<{ ok: true; order: number } | { ok: false; message: string }> {
  const rows = await database
    .get<GameLineup>('game_lineups')
    .query(Q.where('game_remote_id', gameRemoteId))
    .fetch();
  const currentMax = rows.reduce((max, row) => Math.max(max, row.battingOrder ?? 0), 0);
  const order = currentMax + 1;
  if (order > maxBatters) {
    return { ok: false, message: `Lineup is already at the league cap (${maxBatters}).` };
  }
  return { ok: true, order };
}

export interface CreateLocalGuestInput {
  gameRemoteId: string;
  /** From useLeagueContext; null skips the league-pool registration. */
  leagueId: string | null;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  countTowardStats: boolean;
  maxBatters: number;
}

/**
 * Create a brand-new guest identity and append them to the game's lineup, in
 * one local transaction: a guest-only players row (client UUID becomes the
 * server PK on push), an optional league_players registration, and a guest
 * game_lineups row at the next open slot.
 */
export async function createLocalGuest(
  input: CreateLocalGuestInput,
): Promise<LocalLineupWriteResult> {
  const slot = await nextBattingOrder(input.gameRemoteId, input.maxBatters);
  if (!slot.ok) return slot;

  const playerRemoteId = randomUUID();
  const now = Date.now();

  await database.write(async () => {
    const batch: Model[] = [
      database.get<Player>('players').prepareCreate((r) => {
        r._raw.id = playerRemoteId;
        r.remoteId = playerRemoteId;
        r.teamId = undefined; // guest identities belong to no team
        r.firstName = input.firstName;
        r.lastName = input.lastName;
        r.jerseyNumber = input.jerseyNumber ?? undefined;
        r.isActive = true;
        r.isGuestOnly = true;
      }),
      database.get<GameLineup>('game_lineups').prepareCreate((r) => {
        const lineupId = randomUUID();
        r._raw.id = lineupId;
        r.remoteId = lineupId;
        r.gameRemoteId = input.gameRemoteId;
        r.playerRemoteId = playerRemoteId;
        r.battingOrder = slot.order;
        r.isStarter = false;
        r.isGuest = true;
        r.guestDisplayName = `${input.firstName} ${input.lastName}`;
        r.countTowardStats = input.countTowardStats;
        r.updatedAt = now;
      }),
    ];
    if (input.leagueId) {
      batch.push(
        database.get<LeaguePlayer>('league_players').prepareCreate((r) => {
          r._raw.id = leaguePlayerRecordId(input.leagueId!, playerRemoteId);
          r.leagueId = input.leagueId!;
          r.playerRemoteId = playerRemoteId;
          r.registeredAt = now;
        }),
      );
    }
    await database.batch(...batch);
  });

  return { ok: true, playerRemoteId, battingOrder: slot.order };
}

export interface AddExistingGuestInput {
  gameRemoteId: string;
  playerRemoteId: string;
  countTowardStats: boolean;
  maxBatters: number;
}

/**
 * Append an already-known player (league pool / other team) to the lineup as
 * a guest. No new identity or registration rows — the FK carries the name.
 */
export async function addExistingGuestToLineup(
  input: AddExistingGuestInput,
): Promise<LocalLineupWriteResult> {
  const existing = await database
    .get<GameLineup>('game_lineups')
    .query(
      Q.where('game_remote_id', input.gameRemoteId),
      Q.where('player_remote_id', input.playerRemoteId),
    )
    .fetch();
  if (existing.length > 0) {
    return { ok: false, message: 'That player is already in the lineup.' };
  }

  const slot = await nextBattingOrder(input.gameRemoteId, input.maxBatters);
  if (!slot.ok) return slot;

  await database.write(async () => {
    await database.get<GameLineup>('game_lineups').create((r) => {
      const lineupId = randomUUID();
      r._raw.id = lineupId;
      r.remoteId = lineupId;
      r.gameRemoteId = input.gameRemoteId;
      r.playerRemoteId = input.playerRemoteId;
      r.battingOrder = slot.order;
      r.isStarter = false;
      r.isGuest = true;
      r.countTowardStats = input.countTowardStats;
      r.updatedAt = Date.now();
    });
  });

  return { ok: true, playerRemoteId: input.playerRemoteId, battingOrder: slot.order };
}

/**
 * Remove a lineup row. Touches updated_at before the soft delete so the
 * removal counts as a fresh local edit in the LWW conflict guard.
 */
export async function removeLineupRow(row: GameLineup): Promise<void> {
  await database.write(async () => {
    await row.update((r) => {
      r.updatedAt = Date.now();
    });
    await row.markAsDeleted();
  });
}
