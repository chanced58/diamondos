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
 *
 * `priorPositions` carries forward a real fielding position (first_base,
 * shortstop, ...) a player already had in `game_lineups` — e.g. set on the
 * dedicated Lineup screen before the coach ran this wizard. Without it every
 * non-pitcher row is nulled out on submit, silently destroying defensive
 * assignments the web stats pipeline (load-game-stats.ts, derive.ts) reads
 * for fielding-stat attribution. A player with no prior row (or no prior
 * position) still gets `null` — that's a legitimate "not set yet" state.
 */
export function buildBattingOrderLineupRows(
  gameRemoteId: string,
  battingOrder: readonly string[],
  pitcherId: string,
  priorPositions: ReadonlyMap<string, string> = new Map(),
): LineupRowInput[] {
  const rows: LineupRowInput[] = battingOrder.map((playerRemoteId, index) => ({
    gameRemoteId,
    playerRemoteId,
    battingOrder: index + 1,
    startingPosition:
      playerRemoteId === pitcherId ? 'pitcher' : priorPositions.get(playerRemoteId) ?? null,
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

/** A `game_lineups` row as read off the device before the wizard writes. */
export interface ExistingLineupRow {
  playerRemoteId: string;
  battingOrder: number | null;
  startingPosition: string | null;
  isGuest: boolean;
}

export interface LineupReplacementPlan {
  /**
   * 1-based batting-order slots the wizard's order would occupy that a guest
   * already holds. Non-empty means `rowsToDelete`/`rowsToCreate` are both
   * empty — nothing should be written until the coach resolves the
   * collision. Without this guard, the wizard's own soft-delete only clears
   * non-guest rows (correctly preserving the guest), but then hands the sync
   * engine's `resolveBattingOrderCollisions` a duplicate `batting_order` to
   * fix — which it does by silently bumping every colliding starter's slot,
   * and at the league cap can drop one to the bench entirely.
   */
  guestSlotCollisions: number[];
  /** Existing non-guest rows this plan replaces. Empty when blocked by a collision. */
  rowsToDelete: ExistingLineupRow[];
  /**
   * Rows ready for `prepareLineupRow`. Empty when blocked by a collision.
   * Preserves each returning player's prior `starting_position` — see
   * `buildBattingOrderLineupRows`.
   */
  rowsToCreate: LineupRowInput[];
}

/**
 * The pure decision behind `handleStartGame`'s destructive lineup rewrite:
 * given what's already in `game_lineups` and the order the wizard just
 * built, decide whether it's safe to replace the existing rows and, if so,
 * what the replacement should look like. Kept out of score.tsx so both
 * failure modes above are exercised by a test instead of only readable in a
 * 3,000-line screen component.
 */
export function planLineupReplacement(
  existingRows: readonly ExistingLineupRow[],
  gameRemoteId: string,
  battingOrder: readonly string[],
  pitcherId: string,
): LineupReplacementPlan {
  const guestSlots = new Set(
    existingRows
      .filter((row) => row.isGuest && row.battingOrder != null)
      .map((row) => row.battingOrder as number),
  );
  const guestSlotCollisions = battingOrder
    .map((_playerId, index) => index + 1)
    .filter((slot) => guestSlots.has(slot));
  if (guestSlotCollisions.length > 0) {
    return { guestSlotCollisions, rowsToDelete: [], rowsToCreate: [] };
  }

  const nonGuestRows = existingRows.filter((row) => !row.isGuest);
  // Exclude a stale 'pitcher' tag from whoever held it before — the wizard's
  // `pitcherId` is this run's explicit, authoritative pitcher, and carrying
  // an old 'pitcher' position forward onto a now-non-pitching player would
  // produce two rows both marked 'pitcher'.
  const priorPositions = new Map(
    nonGuestRows
      .filter(
        (row): row is ExistingLineupRow & { startingPosition: string } =>
          !!row.startingPosition && row.startingPosition !== 'pitcher',
      )
      .map((row) => [row.playerRemoteId, row.startingPosition]),
  );

  return {
    guestSlotCollisions: [],
    rowsToDelete: nonGuestRows,
    rowsToCreate: buildBattingOrderLineupRows(gameRemoteId, battingOrder, pitcherId, priorPositions),
  };
}
