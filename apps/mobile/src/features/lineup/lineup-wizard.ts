import type { LineupRowInput } from './local-guest';

/**
 * Pure helpers behind the pre-game `LineupSetupModal` (score.tsx). Extracted
 * so the order-building and GAME_START-payload logic can be exercised
 * directly in tests instead of only through the rendered wizard — score.tsx
 * calls these same functions, it never re-derives them.
 *
 * The wizard used to ask "who's batting first?" and write that single id
 * straight into the GAME_START payload, never touching `game_lineups`. That
 * left the order rail with zero rows: the first batter attributed correctly
 * (deriveGameState reads the leadoff out of GAME_START), but nobody after
 * them did. Web's model is the fix: the batting order is the source of
 * truth, and the leadoff written into GAME_START is derived from slot 1 of
 * it (see apps/web/src/app/(app)/games/[gameId]/actions.ts:283).
 */

/**
 * Toggle a player's membership in the batting order the wizard is building.
 * Already in the order → removed (later slots shift down, since order is
 * just array position). Not in the order and under the league's cap →
 * appended at the end (next open slot). Not in the order and at the cap →
 * no-op, so a coach can't build an order the league settings forbid.
 */
export function toggleBattingOrderSlot(
  order: readonly string[],
  playerId: string,
  maxBatters: number,
): string[] {
  if (order.includes(playerId)) {
    return order.filter((id) => id !== playerId);
  }
  if (order.length >= maxBatters) {
    return [...order];
  }
  return [...order, playerId];
}

/** Slot 1 of the order is the leadoff batter — null for an empty order. */
export function deriveLeadoffFromOrder(battingOrder: readonly string[]): string | null {
  return battingOrder[0] ?? null;
}

export interface BuildGameStartPayloadInput {
  /** From the resolved Game row's locationType/neutralHomeTeam. */
  isHome: boolean;
  pitcherId: string;
  battingOrder: readonly string[];
  tracking: { pitchType: boolean; pitchLocation: boolean };
}

/**
 * The GAME_START event payload. Keeps writing `homeLeadoffBatterId` /
 * `awayLeadoffBatterId` — derived from slot 1 of the order rather than asked
 * for directly — because `deriveGameState` (packages/shared/src/utils/
 * game-state.ts:109) reads those keys to restore `currentBatterId` on every
 * half-inning transition, and games already recorded in production depend on
 * it (`game_events` is append-only; there is no retrofitting old rows).
 */
export function buildGameStartPayload(input: BuildGameStartPayloadInput): Record<string, unknown> {
  const leadoffBatterId = deriveLeadoffFromOrder(input.battingOrder);
  return {
    ...(input.isHome
      ? { homeLineupPitcherId: input.pitcherId, homeLeadoffBatterId: leadoffBatterId }
      : { awayLineupPitcherId: input.pitcherId, awayLeadoffBatterId: leadoffBatterId }),
    pitchTypeEnabled: input.tracking.pitchType,
    pitchLocationEnabled: input.tracking.pitchLocation,
  };
}

/**
 * `game_lineups` rows for the order the wizard built, one per slot (slot
 * numbers are 1-based array positions), ready for `prepareLineupRow`.
 *
 * If the starting pitcher isn't one of the selected batters (a DH lineup),
 * they still get a row — batting_order null, starting_position 'pitcher' —
 * so pitch-count tracking survives without a batting slot. Mirrors the
 * dedicated lineup screen's save behavior (app/(tabs)/games/[gameId]/
 * lineup.tsx), which keeps a benched pitcher for the same reason.
 */
export function buildBattingOrderLineupRows(
  gameRemoteId: string,
  battingOrder: readonly string[],
  pitcherId: string,
): LineupRowInput[] {
  const rows: LineupRowInput[] = battingOrder.map((playerRemoteId, index) => ({
    gameRemoteId,
    playerRemoteId,
    battingOrder: index + 1,
    startingPosition: playerRemoteId === pitcherId ? 'pitcher' : null,
    isStarter: true,
    isGuest: false,
    countTowardStats: true,
  }));
  if (!battingOrder.includes(pitcherId)) {
    rows.push({
      gameRemoteId,
      playerRemoteId: pitcherId,
      battingOrder: null,
      startingPosition: 'pitcher',
      isStarter: true,
      isGuest: false,
      countTowardStats: true,
    });
  }
  return rows;
}
