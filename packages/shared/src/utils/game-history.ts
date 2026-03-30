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
}

export interface InningNode {
  number: number;
  top: HalfInningNode | null;
  bottom: HalfInningNode | null;
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
  for (const event of events) {
    if (event.eventType === EventType.PITCH_REVERTED) {
      const payload = event.payload as Record<string, unknown>;
      const keepUntilSeq = payload.revertToSequenceNumber as number;
      result.splice(0, result.length, ...result.filter((e) => e.sequenceNumber <= keepUntilSeq));
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

export function buildGameHistoryTree(
  events: GameEvent[],
  playerNameMap: Map<string, string>,
): GameHistoryTree {
  const tree: GameHistoryTree = {
    innings: [],
    gameStartEvent: null,
    gameEndEvent: null,
  };

  let currentInningNumber = 1;
  let currentIsTop = true;
  let currentHalfInning: HalfInningNode = { isTop: true, label: 'Top', items: [] };
  let currentInning: InningNode = { number: 1, top: null, bottom: null };
  let openAtBat: AtBatNode | null = null;
  let atBatCount = 0;
  let balls = 0;
  let strikes = 0;
  let pitchCount = 0;

  function closeAtBat() {
    if (openAtBat) {
      currentHalfInning.items.push(openAtBat);
      openAtBat = null;
    }
    balls = 0;
    strikes = 0;
    pitchCount = 0;
  }

  function closeHalfInning() {
    closeAtBat();
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
    if (currentInning.top || currentInning.bottom) {
      tree.innings.push(currentInning);
    }
  }

  function startNewHalfInning(isTop: boolean, inningNumber: number) {
    currentIsTop = isTop;
    currentInningNumber = inningNumber;
    atBatCount = 0;
    currentHalfInning = {
      isTop,
      label: isTop ? 'Top' : 'Bottom',
      items: [],
    };
  }

  function getBatterPitcherFromEvent(event: GameEvent): { batterId: string; pitcherId: string } {
    const p = event.payload as Record<string, unknown>;
    const batterId = (p.batterId ?? p.opponentBatterId ?? '') as string;
    const pitcherId = (p.pitcherId ?? p.opponentPitcherId ?? '') as string;
    return { batterId, pitcherId };
  }

  for (const event of events) {
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
        const newInning = event.inning;
        const newIsTop = event.isTopOfInning;

        if (newInning !== currentInningNumber || newIsTop !== currentIsTop) {
          // If switching from top to bottom of same inning, just close half-inning
          if (newInning === currentInningNumber && !newIsTop && currentIsTop) {
            closeHalfInning();
            startNewHalfInning(false, currentInningNumber);
          } else {
            // New inning entirely
            closeInning();
            currentInning = { number: newInning, top: null, bottom: null };
            startNewHalfInning(newIsTop, newInning);
          }
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
          };
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
