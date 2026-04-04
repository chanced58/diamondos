import {
  EventType,
  type GameEvent,
  type PitchThrownPayload,
  type HitPayload,
  type OutPayload,
  type SubstitutionPayload,
  type PitchingChangePayload,
  type BaserunnerMovePayload,
  type PickoffPayload,
  type RundownPayload,
  type ScorePayload,
  PitchOutcome,
} from '../types/game-event';

// ── Types ───────────────────────────────────────────────────────────────────

export type EventCategory = 'positive' | 'negative' | 'neutral' | 'info';

export interface HistoryEventNode {
  event: GameEvent;
  label: string;
  category: EventCategory;
}

export interface PitchNode extends HistoryEventNode {
  /** 1-indexed pitch number within the at-bat */
  pitchNumber: number;
  /** Running count BEFORE this pitch, e.g. "0-0" */
  countBefore: string;
}

export interface AtBatNode {
  type: 'at-bat';
  number: number;
  batterName: string;
  batterId: string;
  pitcherName: string;
  pitcherId: string;
  pitches: PitchNode[];
  /** Events that occurred mid-at-bat (stolen bases, pickoffs, etc.) */
  midAtBatEvents: HistoryEventNode[];
  /** Terminal outcome (hit, out, walk, etc.), null if AB still in progress */
  result: HistoryEventNode | null;
  /** Running score after this at-bat completes */
  homeScore: number;
  awayScore: number;
}

export interface InterstitialNode {
  type: 'interstitial';
  event: GameEvent;
  label: string;
  category: EventCategory;
}

export interface HalfInningNode {
  isTop: boolean;
  label: string;
  items: (AtBatNode | InterstitialNode)[];
  /** Running score at the end of this half-inning */
  homeScore: number;
  awayScore: number;
}

export interface InningNode {
  number: number;
  top: HalfInningNode | null;
  bottom: HalfInningNode | null;
  /** Running score at the end of this full inning */
  homeScore: number;
  awayScore: number;
}

export interface GameHistoryTree {
  innings: InningNode[];
  gameStartEvent: HistoryEventNode | null;
  gameEndEvent: HistoryEventNode | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const TERMINAL_EVENT_TYPES = new Set<string>([
  EventType.HIT,
  EventType.OUT,
  EventType.WALK,
  EventType.HIT_BY_PITCH,
  EventType.STRIKEOUT,
  EventType.SACRIFICE_BUNT,
  EventType.SACRIFICE_FLY,
  EventType.FIELD_ERROR,
  EventType.DOUBLE_PLAY,
  EventType.TRIPLE_PLAY,
]);

const BASE_NAMES: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: 'home',
};

const POSITION_NAMES: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function playerName(id: string | undefined, nameMap: Map<string, string>): string {
  if (!id) return 'Unknown';
  return nameMap.get(id) ?? 'Unknown';
}

function formatFieldingSequence(seq: number[] | undefined): string {
  if (!seq || seq.length === 0) return '';
  return seq.map((n) => POSITION_NAMES[n] ?? String(n)).join('-');
}

function capitalize(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Event Category ──────────────────────────────────────────────────────────

export function getEventCategory(eventType: EventType | string): EventCategory {
  switch (eventType) {
    case EventType.HIT:
    case EventType.WALK:
    case EventType.HIT_BY_PITCH:
    case EventType.STOLEN_BASE:
    case EventType.FIELD_ERROR:
    case EventType.SCORE:
      return 'positive';

    case EventType.OUT:
    case EventType.STRIKEOUT:
    case EventType.CAUGHT_STEALING:
    case EventType.DOUBLE_PLAY:
    case EventType.TRIPLE_PLAY:
    case EventType.SACRIFICE_BUNT:
    case EventType.SACRIFICE_FLY:
    case EventType.BASERUNNER_OUT:
      return 'negative';

    case EventType.SUBSTITUTION:
    case EventType.PITCHING_CHANGE:
    case EventType.PICKOFF_ATTEMPT:
    case EventType.BALK:
    case EventType.INNING_CHANGE:
    case EventType.GAME_START:
    case EventType.GAME_END:
      return 'info';

    default:
      return 'neutral';
  }
}

// ── Label Formatting ────────────────────────────────────────────────────────

function formatPitchOutcome(outcome: PitchOutcome | string): string {
  switch (outcome) {
    case PitchOutcome.CALLED_STRIKE: return 'Called Strike';
    case PitchOutcome.SWINGING_STRIKE: return 'Swinging Strike';
    case PitchOutcome.BALL: return 'Ball';
    case PitchOutcome.FOUL: return 'Foul';
    case PitchOutcome.FOUL_TIP: return 'Foul Tip';
    case PitchOutcome.IN_PLAY: return 'In Play';
    case PitchOutcome.HIT_BY_PITCH: return 'Hit By Pitch';
    case PitchOutcome.INTENTIONAL_BALL: return 'Intentional Ball';
    default: return capitalize(String(outcome));
  }
}

function formatPitchLabel(event: GameEvent, pitchNumber: number, countBefore: string): string {
  const p = event.payload as PitchThrownPayload;
  let label = `Pitch ${pitchNumber} (${countBefore}): ${formatPitchOutcome(p.outcome)}`;
  const details: string[] = [];
  if (p.pitchType) details.push(capitalize(p.pitchType));
  if (p.velocity) details.push(`${p.velocity}mph`);
  if (p.isWildPitch) details.push('Wild Pitch');
  if (p.isPassedBall) details.push('Passed Ball');
  if (details.length > 0) label += ` (${details.join(', ')})`;
  return label;
}

function formatHitLabel(event: GameEvent): string {
  const p = event.payload as HitPayload;
  let label = capitalize(p.hitType);
  if (p.trajectory) label += ` (${capitalize(p.trajectory)})`;
  if (p.rbis && p.rbis > 0) label += ` — ${p.rbis} RBI`;
  return label;
}

function formatOutLabel(event: GameEvent): string {
  const p = event.payload as OutPayload;
  let label = capitalize(p.outType);
  const seq = formatFieldingSequence(p.fieldingSequence);
  if (seq) label += ` (${seq})`;
  else if (p.fieldedBy) label += ` (${p.fieldedBy})`;
  return label;
}

export function formatEventLabel(event: GameEvent, nameMap: Map<string, string>): string {
  switch (event.eventType) {
    case EventType.PITCH_THROWN:
      // Standalone label (used for interstitial display)
      return formatPitchOutcome((event.payload as PitchThrownPayload).outcome);

    case EventType.HIT:
      return formatHitLabel(event);

    case EventType.OUT:
      return formatOutLabel(event);

    case EventType.WALK:
      return 'Walk';

    case EventType.HIT_BY_PITCH:
      return 'Hit By Pitch';

    case EventType.STRIKEOUT:
      return 'Strikeout';

    case EventType.SACRIFICE_BUNT:
      return 'Sacrifice Bunt';

    case EventType.SACRIFICE_FLY:
      return 'Sacrifice Fly';

    case EventType.FIELD_ERROR: {
      const p = event.payload as OutPayload;
      const seq = formatFieldingSequence(p.fieldingSequence);
      return seq ? `Error (${seq})` : 'Error';
    }

    case EventType.DOUBLE_PLAY: {
      const p = event.payload as OutPayload;
      const seq = formatFieldingSequence(p.fieldingSequence);
      return seq ? `Double Play (${seq})` : 'Double Play';
    }

    case EventType.TRIPLE_PLAY: {
      const p = event.payload as OutPayload;
      const seq = formatFieldingSequence(p.fieldingSequence);
      return seq ? `Triple Play (${seq})` : 'Triple Play';
    }

    case EventType.STOLEN_BASE: {
      const p = event.payload as BaserunnerMovePayload;
      const name = playerName(p.runnerId, nameMap);
      return `${name} steals ${BASE_NAMES[p.toBase] ?? ''}`;
    }

    case EventType.CAUGHT_STEALING: {
      const p = event.payload as BaserunnerMovePayload;
      const name = playerName(p.runnerId, nameMap);
      const seq = formatFieldingSequence(p.fieldingSequence);
      return `${name} caught stealing ${BASE_NAMES[p.toBase] ?? ''}${seq ? ` (${seq})` : ''}`;
    }

    case EventType.BASERUNNER_ADVANCE: {
      const p = event.payload as BaserunnerMovePayload;
      const name = playerName(p.runnerId, nameMap);
      const reason = p.reason ? ` (${capitalize(p.reason)})` : '';
      return `${name} advances to ${BASE_NAMES[p.toBase] ?? ''}${reason}`;
    }

    case EventType.BASERUNNER_OUT: {
      const p = event.payload as BaserunnerMovePayload;
      const name = playerName(p.runnerId, nameMap);
      const seq = formatFieldingSequence(p.fieldingSequence);
      return `${name} out on basepaths${seq ? ` (${seq})` : ''}`;
    }

    case EventType.SCORE: {
      const p = event.payload as ScorePayload;
      const name = playerName(p.scoringPlayerId, nameMap);
      return `${name} scores`;
    }

    case EventType.SUBSTITUTION: {
      const p = event.payload as SubstitutionPayload;
      const inName = playerName(p.inPlayerId, nameMap);
      const outName = playerName(p.outPlayerId, nameMap);
      const subType = p.substitutionType ? ` (${capitalize(p.substitutionType)})` : '';
      return `${inName} replaces ${outName}${subType}`;
    }

    case EventType.PITCHING_CHANGE: {
      const p = event.payload as PitchingChangePayload;
      const newP = playerName(p.newPitcherId, nameMap);
      const outP = playerName(p.outgoingPitcherId, nameMap);
      return `${newP} replaces ${outP} on the mound`;
    }

    case EventType.PICKOFF_ATTEMPT: {
      const p = event.payload as PickoffPayload;
      const name = playerName(p.runnerId, nameMap);
      const outcome = p.outcome === 'out' ? 'OUT' : 'safe';
      return `Pickoff attempt at ${BASE_NAMES[p.base] ?? ''} — ${name} ${outcome}`;
    }

    case EventType.RUNDOWN: {
      const p = event.payload as RundownPayload;
      const name = playerName(p.runnerId, nameMap);
      const safeBase = p.outcome === 'safe' ? p.safeAtBase : p.startBase;
      const outcome = p.outcome === 'out' ? 'OUT' : `safe at ${BASE_NAMES[safeBase] ?? ''}`;
      const throwSeq = p.throwSequence.map((n) => POSITION_NAMES[n] ?? String(n)).join('-');
      return `Rundown: ${name} ${outcome}${throwSeq ? ` (${throwSeq})` : ''}`;
    }

    case EventType.BALK:
      return 'Balk';

    case EventType.GAME_START:
      return 'Game Started';

    case EventType.GAME_END:
      return 'Game Over';

    case EventType.INNING_CHANGE:
      return 'Inning Change';

    default:
      return capitalize(event.eventType);
  }
}

// ── Pitch Reverted Filter ───────────────────────────────────────────────────

export function applyPitchRevertedTyped(events: GameEvent[]): GameEvent[] {
  const result: GameEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.eventType === EventType.PITCH_REVERTED) {
      const payload = event.payload as Record<string, unknown>;
      const keepUntilSeq = payload.revertToSequenceNumber as number;
      // Rebuild from original events up to keepUntilSeq, then re-process
      // remaining events so voided markers after the revert point are re-applied
      const kept = events.slice(0, i).filter(
        (e) => e.eventType !== EventType.PITCH_REVERTED
          && e.eventType !== EventType.EVENT_VOIDED
          && e.sequenceNumber <= keepUntilSeq,
      );
      result.splice(0, result.length, ...kept);
    } else if (event.eventType === EventType.EVENT_VOIDED) {
      const payload = event.payload as Record<string, unknown>;
      const voidedId = payload.voidedEventId as string;
      const idx = result.findIndex((e) => e.id === voidedId);
      if (idx !== -1) result.splice(idx, 1);
    } else {
      result.push(event);
    }
  }
  return result;
}

// ── Tree Builder ────────────────────────────────────────────────────────────

function isStrikeOutcome(outcome: PitchOutcome | string): boolean {
  return outcome === PitchOutcome.CALLED_STRIKE
    || outcome === PitchOutcome.SWINGING_STRIKE
    || outcome === PitchOutcome.FOUL_TIP;
}

function isBallOutcome(outcome: PitchOutcome | string): boolean {
  return outcome === PitchOutcome.BALL
    || outcome === PitchOutcome.INTENTIONAL_BALL;
}

/**
 * Reorder events so that any event with `insertAfterSequence` in its payload
 * is positioned immediately after the event with that sequence number,
 * preserving relative order among events targeting the same position.
 */
function applyInsertionOrder(events: GameEvent[]): GameEvent[] {
  // Separate normal events from insertion-targeted events
  const normal: GameEvent[] = [];
  const insertions: GameEvent[] = [];
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (typeof p.insertAfterSequence === 'number') {
      insertions.push(e);
    } else {
      normal.push(e);
    }
  }
  if (insertions.length === 0) return events;

  // Build result by inserting after their targets
  const result = [...normal];
  // Sort insertions by their own sequence number so multiple inserts at the
  // same position maintain a stable order
  insertions.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  for (const ins of insertions) {
    const targetSeq = (ins.payload as Record<string, unknown>).insertAfterSequence as number;
    if (targetSeq <= 0) {
      // Insert at the very beginning
      result.splice(0, 0, ins);
      continue;
    }
    // Find the last index where sequenceNumber <= targetSeq or is another
    // insertion targeting the same or earlier position
    let insertIdx = result.length; // default: append
    for (let i = result.length - 1; i >= 0; i--) {
      const r = result[i];
      const rPayload = r.payload as Record<string, unknown>;
      const rTarget = typeof rPayload.insertAfterSequence === 'number' ? rPayload.insertAfterSequence : r.sequenceNumber;
      if (rTarget <= targetSeq) {
        insertIdx = i + 1;
        break;
      }
    }
    result.splice(insertIdx, 0, ins);
  }
  return result;
}

export function buildGameHistoryTree(
  events: GameEvent[],
  playerNameMap: Map<string, string>,
): GameHistoryTree {
  // Reorder so correction events with insertAfterSequence are positioned correctly
  const orderedEvents = applyInsertionOrder(events);

  const tree: GameHistoryTree = {
    innings: [],
    gameStartEvent: null,
    gameEndEvent: null,
  };

  let currentInningNumber = 1;
  let currentIsTop = true;
  let currentHalfInning: HalfInningNode = { isTop: true, label: 'Top', items: [], homeScore: 0, awayScore: 0 };
  let currentInning: InningNode = { number: 1, top: null, bottom: null, homeScore: 0, awayScore: 0 };
  let openAtBat: AtBatNode | null = null;
  let atBatCount = 0;
  let balls = 0;
  let strikes = 0;
  let pitchCount = 0;

  // Running score tracking
  let homeScore = 0;
  let awayScore = 0;

  // Base runners for score tracking (true = occupied)
  let runnerFirst = false;
  let runnerSecond = false;
  let runnerThird = false;

  function addRuns(runs: number) {
    if (runs <= 0) return;
    if (currentIsTop) {
      awayScore += runs;
    } else {
      homeScore += runs;
    }
  }

  function clearBases() {
    runnerFirst = false;
    runnerSecond = false;
    runnerThird = false;
  }

  function forceAdvance() {
    if (runnerFirst && runnerSecond && runnerThird) {
      addRuns(1);
      runnerThird = runnerSecond; runnerSecond = runnerFirst; runnerFirst = true;
    } else if (runnerFirst && runnerSecond) {
      runnerThird = true; runnerSecond = true; runnerFirst = true;
    } else if (runnerFirst) {
      runnerSecond = true; runnerFirst = true;
    } else {
      runnerFirst = true;
    }
  }

  function hitBases(hitType: string): number {
    switch (hitType) {
      case 'single': return 1;
      case 'double': return 2;
      case 'triple': return 3;
      case 'home_run': return 4;
      default: return 1;
    }
  }

  function closeAtBat() {
    if (openAtBat) {
      openAtBat.homeScore = homeScore;
      openAtBat.awayScore = awayScore;
      currentHalfInning.items.push(openAtBat);
      openAtBat = null;
    }
    balls = 0;
    strikes = 0;
    pitchCount = 0;
  }

  function closeHalfInning() {
    closeAtBat();
    currentHalfInning.homeScore = homeScore;
    currentHalfInning.awayScore = awayScore;
    if (currentHalfInning.items.length > 0) {
      if (currentIsTop) {
        currentInning.top = currentHalfInning;
      } else {
        currentInning.bottom = currentHalfInning;
      }
    }
  }

  function closeInning() {
    closeHalfInning();
    currentInning.homeScore = homeScore;
    currentInning.awayScore = awayScore;
    if (currentInning.top || currentInning.bottom) {
      tree.innings.push(currentInning);
    }
  }

  function startNewHalfInning(isTop: boolean, inningNumber: number) {
    currentIsTop = isTop;
    currentInningNumber = inningNumber;
    atBatCount = 0;
    clearBases();
    currentHalfInning = {
      isTop,
      label: isTop ? 'Top' : 'Bottom',
      items: [],
      homeScore: 0,
      awayScore: 0,
    };
  }

  function getBatterPitcherFromEvent(event: GameEvent): { batterId: string; pitcherId: string } {
    const p = event.payload as Record<string, unknown>;
    const batterId = (p.batterId ?? p.opponentBatterId ?? '') as string;
    const pitcherId = (p.pitcherId ?? p.opponentPitcherId ?? '') as string;
    return { batterId, pitcherId };
  }

  for (const event of orderedEvents) {
    switch (event.eventType) {
      case EventType.GAME_START: {
        tree.gameStartEvent = {
          event,
          label: formatEventLabel(event, playerNameMap),
          category: 'info',
        };
        break;
      }

      case EventType.GAME_END: {
        closeInning();
        tree.gameEndEvent = {
          event,
          label: formatEventLabel(event, playerNameMap),
          category: 'info',
        };
        break;
      }

      case EventType.INNING_CHANGE: {
        // The event's isTopOfInning/inning fields reflect the state BEFORE the
        // change (ScoringBoard records them from gameState at call time). Compute
        // the next half-inning from the builder's own tracking instead.
        if (currentIsTop) {
          // Top → Bottom of the same inning
          closeHalfInning();
          startNewHalfInning(false, currentInningNumber);
        } else {
          // Bottom → Top of the next inning
          closeInning();
          const nextInning = currentInningNumber + 1;
          currentInning = { number: nextInning, top: null, bottom: null, homeScore, awayScore };
          startNewHalfInning(true, nextInning);
        }
        break;
      }

      case EventType.PITCH_THROWN: {
        const p = event.payload as PitchThrownPayload;

        // Start new at-bat if none is open
        if (!openAtBat) {
          const { batterId, pitcherId } = getBatterPitcherFromEvent(event);
          atBatCount++;
          openAtBat = {
            type: 'at-bat',
            number: atBatCount,
            batterId,
            batterName: playerName(batterId, playerNameMap),
            pitcherId,
            pitcherName: playerName(pitcherId, playerNameMap),
            pitches: [],
            midAtBatEvents: [],
            result: null,
            homeScore,
            awayScore,
          };
          balls = 0;
          strikes = 0;
          pitchCount = 0;
        }

        pitchCount++;
        const countBefore = `${balls}-${strikes}`;

        const pitchNode: PitchNode = {
          event,
          label: formatPitchLabel(event, pitchCount, countBefore),
          category: 'neutral',
          pitchNumber: pitchCount,
          countBefore,
        };

        openAtBat.pitches.push(pitchNode);

        // Update running count
        if (isStrikeOutcome(p.outcome)) {
          if (strikes < 2) strikes++;
          // At 2 strikes, foul keeps it at 2 (handled: foul_tip at 2 strikes is strikeout but that comes as separate STRIKEOUT event)
        } else if (p.outcome === PitchOutcome.FOUL) {
          if (strikes < 2) strikes++;
        } else if (isBallOutcome(p.outcome)) {
          balls++;
        }
        // IN_PLAY and HIT_BY_PITCH don't change count — terminal event follows

        break;
      }

      // Terminal events close the at-bat
      case EventType.HIT:
      case EventType.OUT:
      case EventType.WALK:
      case EventType.HIT_BY_PITCH:
      case EventType.STRIKEOUT:
      case EventType.SACRIFICE_BUNT:
      case EventType.SACRIFICE_FLY:
      case EventType.FIELD_ERROR:
      case EventType.DOUBLE_PLAY:
      case EventType.TRIPLE_PLAY: {
        // If no at-bat is open (e.g., walk without tracked pitches), create one
        if (!openAtBat) {
          const { batterId, pitcherId } = getBatterPitcherFromEvent(event);
          atBatCount++;
          openAtBat = {
            type: 'at-bat',
            number: atBatCount,
            batterId,
            batterName: playerName(batterId, playerNameMap),
            pitcherId,
            pitcherName: playerName(pitcherId, playerNameMap),
            pitches: [],
            midAtBatEvents: [],
            result: null,
            homeScore,
            awayScore,
          };
        }

        // Update running score based on the terminal event
        if (event.eventType === EventType.HIT) {
          const hp = event.payload as HitPayload;
          const bases = hitBases(hp.hitType);
          if (bases === 4) {
            let runners = 0;
            if (runnerFirst) runners++;
            if (runnerSecond) runners++;
            if (runnerThird) runners++;
            addRuns(runners + 1);
            clearBases();
          } else {
            let runs = 0;
            if (runnerThird) runs++;
            if (runnerSecond && 2 + bases >= 4) runs++;
            if (runnerFirst && 1 + bases >= 4) runs++;
            addRuns(runs);
            const newFirst = bases === 1;
            const newSecond = bases === 2 || (bases === 1 && runnerFirst);
            const newThird = bases === 3 || (bases === 2 && (runnerFirst || runnerSecond)) || (bases === 1 && runnerSecond);
            runnerFirst = newFirst; runnerSecond = newSecond; runnerThird = newThird;
          }
        } else if (event.eventType === EventType.WALK || event.eventType === EventType.HIT_BY_PITCH) {
          forceAdvance();
        } else if (event.eventType === EventType.FIELD_ERROR) {
          forceAdvance();
        } else if (event.eventType === EventType.SACRIFICE_FLY || event.eventType === EventType.SACRIFICE_BUNT) {
          if (runnerThird) {
            addRuns(1);
            runnerThird = false;
          }
        }

        openAtBat.result = {
          event,
          label: formatEventLabel(event, playerNameMap),
          category: getEventCategory(event.eventType),
        };

        closeAtBat();
        break;
      }

      // Events that can occur mid-at-bat or between at-bats
      case EventType.STOLEN_BASE:
      case EventType.CAUGHT_STEALING:
      case EventType.BASERUNNER_ADVANCE:
      case EventType.BASERUNNER_OUT:
      case EventType.RUNDOWN:
      case EventType.SCORE:
      case EventType.PICKOFF_ATTEMPT:
      case EventType.BALK: {
        // Update base state for score tracking
        if (event.eventType === EventType.SCORE) {
          const sp = event.payload as ScorePayload;
          addRuns(sp.rbis ?? 1);
        } else if (event.eventType === EventType.STOLEN_BASE) {
          const bp = event.payload as BaserunnerMovePayload;
          if (bp.fromBase === 1) runnerFirst = false;
          else if (bp.fromBase === 2) runnerSecond = false;
          else if (bp.fromBase === 3) runnerThird = false;
          if (bp.toBase === 2) runnerSecond = true;
          else if (bp.toBase === 3) runnerThird = true;
          // toBase 4 = scored, handled by SCORE event
        } else if (event.eventType === EventType.CAUGHT_STEALING) {
          const bp = event.payload as BaserunnerMovePayload;
          if (bp.fromBase === 1) runnerFirst = false;
          else if (bp.fromBase === 2) runnerSecond = false;
          else if (bp.fromBase === 3) runnerThird = false;
        } else if (event.eventType === EventType.BASERUNNER_ADVANCE) {
          const bp = event.payload as BaserunnerMovePayload;
          if (bp.fromBase === 1) runnerFirst = false;
          else if (bp.fromBase === 2) runnerSecond = false;
          else if (bp.fromBase === 3) runnerThird = false;
          if (bp.toBase === 2) runnerSecond = true;
          else if (bp.toBase === 3) runnerThird = true;
          // toBase 4 = scored, handled by SCORE event
        } else if (event.eventType === EventType.BASERUNNER_OUT) {
          const bp = event.payload as BaserunnerMovePayload;
          if (bp.fromBase === 1) runnerFirst = false;
          else if (bp.fromBase === 2) runnerSecond = false;
          else if (bp.fromBase === 3) runnerThird = false;
        } else if (event.eventType === EventType.PICKOFF_ATTEMPT) {
          const pp = event.payload as PickoffPayload;
          if (pp.outcome === 'out') {
            if (pp.base === 1) runnerFirst = false;
            else if (pp.base === 2) runnerSecond = false;
            else if (pp.base === 3) runnerThird = false;
          }
        } else if (event.eventType === EventType.RUNDOWN) {
          const rp = event.payload as RundownPayload;
          if (rp.startBase === 1) runnerFirst = false;
          else if (rp.startBase === 2) runnerSecond = false;
          else if (rp.startBase === 3) runnerThird = false;
          if (rp.outcome === 'safe') {
            if (rp.safeAtBase === 1) runnerFirst = true;
            else if (rp.safeAtBase === 2) runnerSecond = true;
            else if (rp.safeAtBase === 3) runnerThird = true;
          }
        } else if (event.eventType === EventType.BALK) {
          // Runner on third scores; the run is credited by a subsequent SCORE
          // event, so we only clear the base here to keep runner state accurate.
          if (runnerThird) runnerThird = false;
          runnerThird = runnerSecond;
          runnerSecond = runnerFirst;
          runnerFirst = false;
        }

        const node: HistoryEventNode = {
          event,
          label: formatEventLabel(event, playerNameMap),
          category: getEventCategory(event.eventType),
        };

        if (openAtBat) {
          openAtBat.midAtBatEvents.push(node);
        } else {
          currentHalfInning.items.push({
            type: 'interstitial',
            event,
            label: node.label,
            category: node.category,
          });
        }
        break;
      }

      case EventType.SUBSTITUTION:
      case EventType.PITCHING_CHANGE: {
        const label = formatEventLabel(event, playerNameMap);
        const category = getEventCategory(event.eventType);

        if (openAtBat) {
          openAtBat.midAtBatEvents.push({ event, label, category });
          // Update batter name if it's a pinch hitter
          if (event.eventType === EventType.SUBSTITUTION) {
            const sp = event.payload as SubstitutionPayload;
            if (sp.substitutionType === 'pinch_hitter' && sp.inPlayerId) {
              openAtBat.batterId = sp.inPlayerId;
              openAtBat.batterName = playerName(sp.inPlayerId, playerNameMap);
            }
          }
        } else {
          currentHalfInning.items.push({
            type: 'interstitial',
            event,
            label,
            category,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  // Finalize any remaining open state
  if (!tree.gameEndEvent) {
    closeInning();
  }

  return tree;
}
