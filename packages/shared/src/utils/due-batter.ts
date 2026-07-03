import {
  EventType,
  SubstitutionType,
  type GameEvent,
  type SubstitutionPayload,
} from '../types/game-event';

/** A batting-order slot: who occupies which spot in the order. */
export interface BattingSlot {
  playerId: string;
  battingOrder: number;
}

/** Minimal event shape so both WDB-mapped and web-row-mapped events work. */
type LineupEvent = Pick<GameEvent, 'eventType' | 'payload'>;

/**
 * Fold SUBSTITUTION events (pinch hitters/runners, defensive subs, lineup
 * extensions) into a base batting order so the due-batter rotation reflects
 * mid-game changes. Id-only port of the web ScoringBoard's
 * applySubstitutions. Events must already be void/revert-filtered
 * (see filterVoidedAndRevertedEvents) and sorted by sequence number.
 */
export function applyLineupSubstitutions(
  slots: BattingSlot[],
  events: LineupEvent[],
  opts?: { forOpponent?: boolean },
): BattingSlot[] {
  const forOpponent = opts?.forOpponent ?? false;
  const result = slots.map((s) => ({ ...s }));

  for (const event of events) {
    if (event.eventType !== EventType.SUBSTITUTION) continue;
    const p = (event.payload ?? {}) as Partial<SubstitutionPayload>;
    if (Boolean(p.isOpponentSubstitution) !== forOpponent) continue;
    // Position changes move a fielder, not a batting slot.
    if (p.substitutionType === SubstitutionType.POSITION_CHANGE) continue;
    const inId = p.inPlayerId;
    if (!inId) continue;

    // Lineup extension: no outgoing player + an explicit batting order slot
    // means a new batter joins the end of the order (10th, 11th, …).
    if (!p.outPlayerId && typeof p.battingOrderPosition === 'number') {
      const battingOrder = p.battingOrderPosition;
      if (!result.some((s) => s.battingOrder === battingOrder)) {
        result.push({ playerId: inId, battingOrder });
        result.sort((a, b) => a.battingOrder - b.battingOrder);
      }
      continue;
    }

    const idx = result.findIndex((s) => s.playerId === p.outPlayerId);
    if (idx === -1) continue;
    result[idx] = { ...result[idx], playerId: inId };
  }

  return result;
}

/**
 * Which batter is due up, cycling the lineup by index (not slot number) so
 * non-contiguous batting orders — e.g. slots 1,2,3,5,… after a removal —
 * still rotate through every batter. Mirrors the web ScoringBoard's
 * `effectiveStarters[completedTeamPAs % length]` derivation.
 *
 * `completedTeamPAs` is the offensive team's cumulative completed plate
 * appearances (completedTopHalfPAs / completedBottomHalfPAs from
 * deriveGameState, picked by which half the team bats in).
 */
export function deriveDueBatter(
  slots: BattingSlot[],
  completedTeamPAs: number,
): { playerId: string; battingOrder: number; index: number } | null {
  if (slots.length === 0) return null;
  const sorted = [...slots].sort((a, b) => a.battingOrder - b.battingOrder);
  const index = completedTeamPAs % sorted.length;
  const slot = sorted[index];
  return { playerId: slot.playerId, battingOrder: slot.battingOrder, index };
}

/**
 * Event-payload player attribution for whichever half-inning is active.
 * Payload convention (types/game-event.ts): `batterId`/`pitcherId` reference
 * platform players; `opponentBatterId`/`opponentPitcherId` reference
 * opponent players. Exactly one of each pair should be set per event.
 */
export interface HalfAttribution {
  batterId?: string;
  opponentBatterId?: string;
  pitcherId?: string;
  opponentPitcherId?: string;
}

/**
 * Build the correct batter/pitcher payload fields for the active half.
 *
 * Our side always uses OUR derived ids (the due batter from the lineup, our
 * current pitcher from the lineup / pitching changes) — never the reducer's
 * `currentBatterId`/`currentPitcherId`, which INNING_CHANGE resets to null and
 * which can hold the opponent's or a stale id. The opponent side is filled
 * from the reducer state, but only when that id is NOT one of ours (guards
 * against a stale leak from our own half being mis-filed as the opponent).
 *
 * - Our offensive half: `batterId` = our due batter; `opponentPitcherId` =
 *   the state pitcher when it is not one of ours.
 * - Our defensive half: `pitcherId` = our current pitcher; `opponentBatterId`
 *   = the state batter when it is not one of ours.
 *
 * Ids of unknown provenance are omitted rather than mis-attributed; stats
 * modules skip events with no batter/pitcher rather than credit a wrong
 * player.
 */
export function attributePlayersForHalf(args: {
  weAreHome: boolean;
  isTopOfInning: boolean;
  /** The batter we derived from our own lineup (due batter or override). */
  ourBatterId: string | null;
  /** Our current pitcher, derived from GAME_START + our PITCHING_CHANGEs
   *  (persists across innings — unlike gameState.currentPitcherId, which
   *  INNING_CHANGE resets to null). */
  ourPitcherId: string | null;
  /** gameState.currentPitcherId — used only to identify the opponent pitcher. */
  statePitcherId: string | null;
  /** gameState.currentBatterId — used only to identify the opponent batter. */
  stateBatterId: string | null;
  /** Every platform player id we can attribute to: roster + lineup (incl. guests). */
  ourPlayerIds: ReadonlySet<string>;
}): HalfAttribution {
  const { weAreHome, isTopOfInning, ourBatterId, ourPitcherId, statePitcherId, stateBatterId, ourPlayerIds } = args;
  // Home bats in the bottom half; away bats in the top half.
  const weBat = weAreHome ? !isTopOfInning : isTopOfInning;
  const result: HalfAttribution = {};

  if (weBat) {
    if (ourBatterId) result.batterId = ourBatterId;
    if (statePitcherId && !ourPlayerIds.has(statePitcherId)) {
      result.opponentPitcherId = statePitcherId;
    }
  } else {
    if (ourPitcherId) result.pitcherId = ourPitcherId;
    if (stateBatterId && !ourPlayerIds.has(stateBatterId)) {
      result.opponentBatterId = stateBatterId;
    }
  }

  return result;
}
