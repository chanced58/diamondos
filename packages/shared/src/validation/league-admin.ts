import { z } from 'zod';

/**
 * Contracts for league administration on mobile (the web /league/admin
 * pages), served by `/api/m/v1/league-admin/:leagueId/*`. League staff
 * (admins and managers) read; only league admins change anything. The write
 * inputs reuse `createLeaguePlayerSchema`, `transferPlayerSchema` and
 * `releasePlayerSchema` from `league-player.ts`.
 */

const uuid = z.string().uuid();

export const leagueAdminInputSchema = z.object({ leagueId: uuid });
export const leagueAdminPlayerInputSchema = z.object({ leagueId: uuid, playerId: uuid });

// ── League players ───────────────────────────────────────────────────────────

export const leagueAdminPlayerSchema = z.object({
  playerId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  jerseyNumber: z.number().nullable(),
  primaryPosition: z.string().nullable(),
  /** Null for a free agent. */
  teamId: z.string().nullable(),
  teamName: z.string().nullable(),
});
export type LeagueAdminPlayer = z.infer<typeof leagueAdminPlayerSchema>;

/** An active platform team in the league, which players can be assigned to. */
export const leagueAdminTeamSchema = z.object({
  teamId: z.string(),
  name: z.string(),
  divisionId: z.string().nullable(),
});
export type LeagueAdminTeam = z.infer<typeof leagueAdminTeamSchema>;

export const leagueAdminDivisionSchema = z.object({ id: z.string(), name: z.string() });
export type LeagueAdminDivision = z.infer<typeof leagueAdminDivisionSchema>;

/** The league's registered players (guest-only identities excluded), its teams and divisions. */
export const leaguePlayersResponseSchema = z.object({
  league: z.object({ id: z.string(), name: z.string() }),
  /** League admins add, trade and release players; managers read. */
  canEdit: z.boolean(),
  players: z.array(leagueAdminPlayerSchema),
  teams: z.array(leagueAdminTeamSchema),
  divisions: z.array(leagueAdminDivisionSchema),
});
export type LeaguePlayersResponse = z.infer<typeof leaguePlayersResponseSchema>;

export const PLAYER_TRANSFER_TYPES = ['initial_assignment', 'trade', 'release', 'reassignment'] as const;
export type PlayerTransferType = (typeof PLAYER_TRANSFER_TYPES)[number];

export const PLAYER_TRANSFER_TYPE_LABELS: Record<PlayerTransferType, string> = {
  initial_assignment: 'Initial assignment',
  trade: 'Trade',
  release: 'Release',
  reassignment: 'Season move',
};

export const leaguePlayerTransferSchema = z.object({
  id: z.string(),
  type: z.enum(PLAYER_TRANSFER_TYPES).nullable(),
  fromTeamName: z.string().nullable(),
  /** Null when the move made them a free agent. */
  toTeamName: z.string().nullable(),
  transferredAt: z.string(),
  reason: z.string().nullable(),
});
export type LeaguePlayerTransfer = z.infer<typeof leaguePlayerTransferSchema>;

/** One league player, their transfer history (newest first) and the league's teams. */
export const leaguePlayerDetailResponseSchema = z.object({
  canEdit: z.boolean(),
  player: leagueAdminPlayerSchema.extend({
    dateOfBirth: z.string().nullable(),
    bats: z.string().nullable(),
    throws: z.string().nullable(),
    graduationYear: z.number().nullable(),
  }),
  transfers: z.array(leaguePlayerTransferSchema),
  teams: z.array(leagueAdminTeamSchema),
});
export type LeaguePlayerDetailResponse = z.infer<typeof leaguePlayerDetailResponseSchema>;

export const leaguePlayerCreatedResponseSchema = z.object({ playerId: z.string() });
export type LeaguePlayerCreatedResponse = z.infer<typeof leaguePlayerCreatedResponseSchema>;

/**
 * A move either happened, or stopped because the player's jersey number is
 * taken on the destination team: the admin can then confirm, clearing it.
 */
export const transferLeaguePlayerResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('moved'), transferId: z.string() }),
  z.object({ status: z.literal('jersey_conflict'), jerseyNumber: z.number().nullable(), conflictingPlayerName: z.string() }),
]);
export type TransferLeaguePlayerResponse = z.infer<typeof transferLeaguePlayerResponseSchema>;

export const releaseLeaguePlayerResponseSchema = z.object({ transferId: z.string() });
export type ReleaseLeaguePlayerResponse = z.infer<typeof releaseLeaguePlayerResponseSchema>;

/** `''` all teams, `'free'` free agents, or a team id. */
export interface LeaguePlayerFilter {
  search: string;
  teamId: string;
  divisionId: string;
}

/**
 * The web League Players filters: a name or jersey search, a team (or free
 * agents) and a division. Free agents have no division, so the division
 * filter is ignored while looking at them.
 */
export function filterLeaguePlayers(
  players: LeagueAdminPlayer[],
  teams: LeagueAdminTeam[],
  filter: LeaguePlayerFilter,
): LeagueAdminPlayer[] {
  const search = filter.search.trim().toLowerCase();
  const divisionByTeam = new Map(teams.map((team) => [team.teamId, team.divisionId]));
  return players.filter((player) => {
    if (filter.teamId === 'free' && player.teamId !== null) return false;
    if (filter.teamId && filter.teamId !== 'free' && player.teamId !== filter.teamId) return false;
    if (filter.divisionId && filter.teamId !== 'free') {
      if (!player.teamId || divisionByTeam.get(player.teamId) !== filter.divisionId) return false;
    }
    if (search) {
      const text = `${player.firstName} ${player.lastName} #${player.jerseyNumber ?? ''}`.toLowerCase();
      if (!text.includes(search)) return false;
    }
    return true;
  });
}
