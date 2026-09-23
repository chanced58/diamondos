import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/**
 * Local mirror of a league_players registry row (every player who has
 * appeared in the league — seeds the offline guest picker).
 *
 * The record id is the flattened composite server PK: `${leagueId}:${playerId}`.
 * Pull mapping and local creation must both use this form so upsert echoes
 * merge by id instead of duplicating.
 */
export class LeaguePlayer extends Model {
  static table = 'league_players';

  @field('league_id') leagueId!: string;
  @field('player_remote_id') playerRemoteId!: string;
  @field('registered_at') registeredAt!: number;
  @field('synced_at') syncedAt!: number | undefined;
}

export function leaguePlayerRecordId(leagueId: string, playerRemoteId: string): string {
  return `${leagueId}:${playerRemoteId}`;
}

/**
 * Inverse of `leaguePlayerRecordId`. Both ids are UUIDs, which never contain
 * `:`, so splitting on the first occurrence is unambiguous. Used by the sync
 * engine's keyset pagination cursor for `league_players`, which has no `id`
 * column server-side and needs the two key parts back out to build its
 * composite `.or()` filter.
 */
export function parseLeaguePlayerRecordId(recordId: string): {
  leagueId: string;
  playerRemoteId: string;
} {
  const separatorIndex = recordId.indexOf(':');
  if (separatorIndex === -1) {
    throw new Error(`parseLeaguePlayerRecordId: malformed record id "${recordId}"`);
  }
  return {
    leagueId: recordId.slice(0, separatorIndex),
    playerRemoteId: recordId.slice(separatorIndex + 1),
  };
}
