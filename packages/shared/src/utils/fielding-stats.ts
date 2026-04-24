import { EventType, type GameEvent } from '../types/game-event';
import type { FieldingStats } from '../types/fielding';

/**
 * Per-game defensive alignment context.
 *
 * - `isHome` identifies which half-inning our team is fielding in (top when
 *   home, bottom when visitor). Events outside our defensive half-inning are
 *   skipped — fielding credit would otherwise leak to opposing fielders who
 *   happen to share the same position number.
 * - `startingPositions` maps position numbers (1–9) to OUR player IDs at the
 *   start of the game. Position keys not present here have no owner until a
 *   SUBSTITUTION event introduces one; events referencing empty positions
 *   are silently skipped so they don't accumulate against a phantom player.
 */
export type FieldingLineupContext = {
  isHome: boolean;
  startingPositions: Map<number, string>;
};

const POSITION_NUMBER_BY_NAME: Record<string, number> = {
  P: 1, C: 2,
  '1B': 3, '2B': 4, '3B': 5, SS: 6,
  LF: 7, CF: 8, RF: 9,
  // Common long-form / snake_case aliases emitted by some scorer paths.
  PITCHER: 1, CATCHER: 2,
  FIRST_BASE: 3, SECOND_BASE: 4, THIRD_BASE: 5, SHORTSTOP: 6,
  LEFT_FIELD: 7, CENTER_FIELD: 8, RIGHT_FIELD: 9,
};

/**
 * Normalize a free-form position string (e.g. 'SS', 'ss', 'Shortstop',
 * ' shortstop ', 'first_base') to a canonical number, or null when
 * unrecognized. Unrecognized input returns null silently — the shared
 * package is environment-agnostic (runs in tests, mobile, and browser)
 * so we don't call console here; surface bad scorer input at the UI
 * layer instead.
 */
function positionNumberFrom(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return POSITION_NUMBER_BY_NAME[key] ?? null;
}

function makeEmpty(playerId: string, playerName: string): FieldingStats {
  return {
    playerId,
    playerName,
    gamesAppeared: 0,
    putouts: 0,
    assists: 0,
    errors: 0,
    fieldingPct: NaN,
  };
}

/**
 * Derive per-player fielding stats (PO, A, E, FLD%) from game events.
 *
 * Attribution rules (kept simple on purpose — the underlying `game_events`
 * schema stores one `fieldingSequence` per out event, so we infer multi-out
 * credit from event type + sequence length):
 *
 *   - OUT / DROPPED_THIRD_STRIKE (thrown_out) / CAUGHT_STEALING: last position
 *     in fieldingSequence is a putout; every preceding position is an assist.
 *   - DOUBLE_PLAY: 2 outs. The last two positions in fieldingSequence get a
 *     putout each (the middle fielder records the force out at 2nd in the
 *     classic 6-4-3 case). All non-last positions also get an assist because
 *     every throw before the final out involves delivery from that fielder.
 *   - TRIPLE_PLAY: 3 outs. The last three positions each get a putout, and
 *     non-last positions get an assist. Unassisted triple plays (length 1)
 *     credit only 1 PO — callers should not construct such events, but we
 *     defend against it.
 *   - FIELD_ERROR: errorBy position is charged with an error.
 *   - DROPPED_THIRD_STRIKE (reached_on_error): errorBy position is charged
 *     with an error; fieldingSequence is ignored.
 *
 * Caveat: two-out DPs without a middle fielder (unassisted 3-unassisted DP
 * represented as fieldingSequence=[3]) will only credit one PO. The schema
 * doesn't currently distinguish those, so callers should split-record them
 * as two outs if higher fidelity is needed.
 */
export function deriveFieldingStats(
  events: GameEvent[],
  players: { id: string; firstName: string; lastName: string }[],
  alignmentByGameId: Map<string, FieldingLineupContext>,
): Map<string, FieldingStats> {
  const nameMap = new Map<string, string>(
    players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
  );
  const statsMap = new Map<string, FieldingStats>();

  const getStats = (playerId: string): FieldingStats => {
    if (!statsMap.has(playerId)) {
      const name = nameMap.get(playerId) ?? 'Unknown';
      statsMap.set(playerId, makeEmpty(playerId, name));
    }
    return statsMap.get(playerId)!;
  };

  // Group events by game_id preserving sequence order. Events with no
  // resolvable gameId are dropped rather than bucketed under `undefined`.
  const gameMap = new Map<string, GameEvent[]>();
  for (const event of events) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gameId: string | undefined = (event as any).game_id ?? event.gameId;
    if (!gameId) continue;
    if (!gameMap.has(gameId)) gameMap.set(gameId, []);
    gameMap.get(gameId)!.push(event);
  }

  // Drive the outer loop from the alignment map, not the event map — callers
  // who supply an alignment for a game but no events still want the starters
  // credited with gamesAppeared (they played defense; absence of fielding
  // chances doesn't mean absence of participation).
  for (const [gameId, alignment] of alignmentByGameId.entries()) {
    const gameEvents = gameMap.get(gameId) ?? [];

    gameEvents.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aSeq = (a as any).sequence_number ?? a.sequenceNumber;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bSeq = (b as any).sequence_number ?? b.sequenceNumber;
      return aSeq - bSeq;
    });

    // Track which players have been credited with an appearance this game.
    // Arrow function so it satisfies no-inner-declarations while still
    // closing over appearedThisGame and getStats.
    const appearedThisGame = new Set<string>();
    const markAppeared = (playerId: string): void => {
      if (!appearedThisGame.has(playerId)) {
        appearedThisGame.add(playerId);
        getStats(playerId).gamesAppeared += 1;
      }
    };

    // Mutable position → player map (cloned so the context passed in by the
    // caller isn't mutated across iterations).
    const positions = new Map<number, string>(alignment.startingPositions);

    // Seed gamesAppeared for every starter — even those who never see a PO,
    // A, or E. "Played defensively" is appearance enough; without this,
    // shutout games look empty for solid-defense utility fielders.
    for (const playerId of alignment.startingPositions.values()) {
      markAppeared(playerId);
    }

    const playerAtPosition = (posNum: number): string | null =>
      positions.get(posNum) ?? null;

    const isOurDefensiveHalf = (isTop: boolean): boolean =>
      alignment.isHome ? isTop : !isTop;

    const creditPO = (posNum: number): void => {
      const playerId = playerAtPosition(posNum);
      if (!playerId) return;
      markAppeared(playerId);
      getStats(playerId).putouts += 1;
    };

    const creditAssist = (posNum: number): void => {
      const playerId = playerAtPosition(posNum);
      if (!playerId) return;
      markAppeared(playerId);
      getStats(playerId).assists += 1;
    };

    const creditError = (posNum: number): void => {
      const playerId = playerAtPosition(posNum);
      if (!playerId) return;
      markAppeared(playerId);
      getStats(playerId).errors += 1;
    };

    /**
     * Credit a fielding play from a `fieldingSequence` of position numbers.
     * `outsRecorded` tells us how many putouts to award — the last N positions
     * in the sequence each get +1 PO; every non-last position also gets +1 A.
     */
    const creditFieldingSequence = (seq: number[] | undefined, outsRecorded: number): void => {
      if (!seq || seq.length === 0) return;
      const putoutCount = Math.min(outsRecorded, seq.length);
      // Putouts are the last `putoutCount` positions.
      for (let i = seq.length - putoutCount; i < seq.length; i++) {
        creditPO(seq[i]);
      }
      // Assists are every position before the final position that throws in
      // the chain. For multi-out plays (DP/TP), the middle fielders record
      // both a PO AND an A because they caught+threw.
      for (let i = 0; i < seq.length - 1; i++) {
        creditAssist(seq[i]);
      }
    };

    for (const event of gameEvents) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const etype: string = (event as any).event_type ?? event.eventType;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (event.payload ?? {}) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isTop: boolean = (event as any).is_top_of_inning ?? event.isTopOfInning ?? true;

      // Hoist the fieldingSequence read once per event — four event types
      // below consume it, and centralizing the cast makes future schema
      // changes a single-line edit.
      const fieldingSequence = payload?.fieldingSequence as number[] | undefined;

      // ── Position tracking (apply regardless of half-inning) ────────────
      // These substitutions happen during our fielding half-inning, but the
      // event itself is logged with the half-inning state at the time of
      // recording. Apply unconditionally so the map stays correct.
      if (etype === 'substitution') {
        const isOpponentSub = payload?.isOpponentSubstitution === true;
        if (!isOpponentSub && payload?.inPlayerId) {
          const inId = payload.inPlayerId as string;
          const posNum = positionNumberFrom(payload?.newPosition as string | undefined);
          if (posNum) positions.set(posNum, inId);
          // Mark defensive sub as appeared even if they never record a PO/A/E.
          markAppeared(inId);
        }
        continue;
      }
      if (etype === 'pitching_change') {
        const isOpponentChange = payload?.isOpponentChange === true;
        if (!isOpponentChange && typeof payload?.newPitcherId === 'string') {
          const newPitcherId = payload.newPitcherId as string;
          positions.set(1, newPitcherId);
          markAppeared(newPitcherId);
        }
        continue;
      }

      // ── All scoring events below require that we are fielding ──────────
      if (!isOurDefensiveHalf(isTop)) continue;

      if (etype === EventType.OUT) {
        creditFieldingSequence(fieldingSequence, 1);
        continue;
      }

      if (etype === EventType.FIELD_ERROR) {
        const errPos = payload?.errorBy as number | undefined;
        if (typeof errPos === 'number') creditError(errPos);
        continue;
      }

      if (etype === EventType.DROPPED_THIRD_STRIKE) {
        const outcome = payload?.outcome as string | undefined;
        if (outcome === 'thrown_out') {
          creditFieldingSequence(fieldingSequence, 1);
        } else if (outcome === 'reached_on_error') {
          const errPos = payload?.errorBy as number | undefined;
          if (typeof errPos === 'number') creditError(errPos);
        }
        // 'reached_wild_pitch' is not a fielding stat — ball got away.
        continue;
      }

      if (etype === 'caught_stealing') {
        creditFieldingSequence(fieldingSequence, 1);
        continue;
      }

      if (etype === EventType.DOUBLE_PLAY) {
        creditFieldingSequence(fieldingSequence, 2);
        continue;
      }

      if (etype === EventType.TRIPLE_PLAY) {
        creditFieldingSequence(fieldingSequence, 3);
        continue;
      }

      // MLB 9.09: a strikeout credits the catcher with a putout. When the
      // event carries a fieldingSequence (D3K thrown out) the explicit chain
      // takes precedence and is handled above; a plain STRIKEOUT falls
      // through to the catcher-PO default.
      if (etype === EventType.STRIKEOUT) {
        creditPO(2);
        continue;
      }

      // Sacrifice outs: fielding credit comes from the sequence just like a
      // regular OUT (one out recorded). If no sequence is provided, no one
      // gets credit — that's a scorer data-quality concern.
      if (etype === EventType.SACRIFICE_FLY || etype === EventType.SACRIFICE_BUNT) {
        creditFieldingSequence(fieldingSequence, 1);
        continue;
      }
    }
  }

  for (const s of statsMap.values()) {
    const chances = s.putouts + s.assists + s.errors;
    s.fieldingPct = chances > 0 ? (s.putouts + s.assists) / chances : NaN;
  }

  return statsMap;
}
