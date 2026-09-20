import {
  EventType,
  HitType,
  PitchOutcome,
  type BaserunnerMovePayload,
  type HitPayload,
  type OutPayload,
  type PitchThrownPayload,
  type SubstitutionPayload,
  type PitchingChangePayload,
  type ScorePayload,
} from '../types/game-event';

/**
 * Minimal shape formatEventDescription needs from an event — deliberately
 * looser than the full GameEvent so both the web (snake_case DB row) and
 * mobile (camelCase GameEvent) callers can adapt their own event shape
 * without an intermediate copy.
 */
export type EventDescriptionInput = {
  eventType: string;
  payload: unknown;
};

/**
 * Resolves a display name for a player/runner id. Callers own their own
 * name-lookup shape (web's richer {lastName, jerseyNumber} map, mobile's
 * flat id->name map) — this keeps the formatter itself free of either.
 * Return '—' for an unknown or missing id, matching prior ticker behavior.
 */
export type PlayerNameResolver = (id: string | null | undefined) => string;

const BASE_NAMES: Record<number, string> = { 2: 'second', 3: 'third', 4: 'home' };

const HIT_LABELS: Record<HitType, string> = {
  [HitType.SINGLE]: 'single',
  [HitType.DOUBLE]: 'double',
  [HitType.TRIPLE]: 'triple',
  [HitType.HOME_RUN]: 'home run',
  [HitType.GROUND_BALL]: 'ground-ball single',
  [HitType.FLY_BALL]: 'fly-ball hit',
  [HitType.LINE_DRIVE]: 'line drive',
  [HitType.POP_UP]: 'pop-up',
};

function batterName(
  resolve: PlayerNameResolver,
  p: { batterId?: string; opponentBatterId?: string },
): string {
  return resolve(p.batterId ?? p.opponentBatterId ?? null);
}

function runnerName(resolve: PlayerNameResolver, p: { runnerId?: string }): string {
  return resolve(p.runnerId ?? null);
}

/**
 * Pure, human-readable description of a single game event — "Alice — double",
 * "Called strike", "Bob steals third". Returns null for events that
 * shouldn't surface as their own line: correction markers (PITCH_REVERTED,
 * EVENT_VOIDED — callers decide how to represent the correction itself) and
 * a handful of non-eventful outcomes (e.g. a safe pickoff attempt).
 *
 * Moved from apps/web/src/lib/live/format-event-ticker.ts (Task 9) so the
 * mobile play-by-play feed can reuse the same descriptions instead of a
 * second implementation; web now wraps this with its PlayerNameMap adapter.
 */
export function formatEventDescription(
  event: EventDescriptionInput,
  resolveName: PlayerNameResolver,
): string | null {
  const payload = (event.payload ?? {}) as unknown;

  switch (event.eventType) {
    case EventType.HIT: {
      const p = payload as HitPayload;
      const label = HIT_LABELS[p.hitType] ?? 'hit';
      const who = batterName(resolveName, p);
      return who === '—' ? label.charAt(0).toUpperCase() + label.slice(1) : `${who} — ${label}`;
    }
    case EventType.WALK: {
      const p = payload as { batterId?: string; opponentBatterId?: string };
      const who = batterName(resolveName, p);
      return who === '—' ? 'Walk' : `${who} — walk`;
    }
    case EventType.HIT_BY_PITCH: {
      const p = payload as { batterId?: string; opponentBatterId?: string };
      const who = batterName(resolveName, p);
      return who === '—' ? 'Hit by pitch' : `${who} — hit by pitch`;
    }
    case EventType.STRIKEOUT: {
      const p = payload as { batterId?: string; opponentBatterId?: string };
      const who = batterName(resolveName, p);
      return who === '—' ? 'Strikeout' : `${who} — strikeout`;
    }
    case EventType.OUT: {
      const p = payload as OutPayload;
      const who = batterName(resolveName, p);
      const kind =
        p.outType === 'groundout' ? 'groundout'
        : p.outType === 'flyout' ? 'flyout'
        : p.outType === 'lineout' ? 'lineout'
        : p.outType === 'popout' ? 'popout'
        : 'out';
      return who === '—' ? kind.charAt(0).toUpperCase() + kind.slice(1) : `${who} — ${kind}`;
    }
    case EventType.STOLEN_BASE: {
      const p = payload as BaserunnerMovePayload;
      const who = runnerName(resolveName, p);
      const base = BASE_NAMES[p.toBase] ?? 'next base';
      return who === '—' ? `Stolen base (${base})` : `${who} steals ${base}`;
    }
    case EventType.CAUGHT_STEALING: {
      const p = payload as BaserunnerMovePayload;
      const who = runnerName(resolveName, p);
      const base = BASE_NAMES[p.toBase] ?? '';
      return who === '—' ? 'Caught stealing' : `${who} caught stealing${base ? ` ${base}` : ''}`;
    }
    case EventType.BASERUNNER_ADVANCE: {
      const p = payload as BaserunnerMovePayload;
      const who = runnerName(resolveName, p);
      const dest = p.toBase === 4 ? 'scores' : `to ${BASE_NAMES[p.toBase] ?? 'next'}`;
      return who === '—' ? `Runner ${dest}` : `${who} ${dest}`;
    }
    case EventType.BASERUNNER_OUT: {
      const p = payload as BaserunnerMovePayload;
      const who = runnerName(resolveName, p);
      return who === '—' ? 'Runner out' : `${who} out on the basepaths`;
    }
    case EventType.PICKOFF_ATTEMPT: {
      const p = payload as { runnerId: string; outcome?: 'safe' | 'out'; base: number };
      const who = resolveName(p.runnerId);
      if (p.outcome === 'out') return who === '—' ? 'Picked off' : `${who} picked off`;
      return null;
    }
    case EventType.SCORE: {
      const p = payload as ScorePayload;
      const who = resolveName(p.scoringPlayerId);
      return who === '—' ? 'Run scored' : `${who} scores`;
    }
    case EventType.PITCH_THROWN: {
      const p = payload as PitchThrownPayload;
      switch (p.outcome) {
        case PitchOutcome.CALLED_STRIKE: return 'Called strike';
        case PitchOutcome.SWINGING_STRIKE: return 'Swinging strike';
        case PitchOutcome.BALL: return 'Ball';
        case PitchOutcome.FOUL: return 'Foul ball';
        case PitchOutcome.FOUL_TIP: return 'Foul tip';
        case PitchOutcome.IN_PLAY: return 'In play';
        case PitchOutcome.HIT_BY_PITCH: return 'Hit by pitch';
        case PitchOutcome.INTENTIONAL_BALL: return 'Intentional ball';
        default: return null;
      }
    }
    case EventType.SUBSTITUTION: {
      const p = payload as SubstitutionPayload;
      const incoming = resolveName(p.inPlayerId);
      return incoming === '—' ? 'Substitution' : `${incoming} subs in`;
    }
    case EventType.PITCHING_CHANGE: {
      const p = payload as PitchingChangePayload;
      const incoming = resolveName(p.newPitcherId);
      return incoming === '—' ? 'Pitching change' : `${incoming} now pitching`;
    }
    case EventType.SACRIFICE_BUNT: return 'Sacrifice bunt';
    case EventType.SACRIFICE_FLY: return 'Sacrifice fly';
    case EventType.DROPPED_THIRD_STRIKE: return 'Dropped third strike';
    case EventType.DOUBLE_PLAY: return 'Double play';
    case EventType.TRIPLE_PLAY: return 'Triple play';
    case EventType.FIELD_ERROR: return 'Fielding error';
    case EventType.CATCHER_INTERFERENCE: return 'Catcher interference';
    case EventType.BALK: return 'Balk';
    case EventType.RUNDOWN: return 'Rundown';
    case EventType.INNING_CHANGE: return 'Inning change';
    case EventType.GAME_START: return 'Play ball!';
    case EventType.GAME_END: return 'Final';
    // Correction events shouldn't surface as their own line — the caller
    // decides how (or whether) to represent the correction itself.
    case EventType.PITCH_REVERTED: return null;
    case EventType.EVENT_VOIDED: return null;
    default: return null;
  }
}
