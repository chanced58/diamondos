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
} from '@baseball/shared';
import { formatPlayer, type PlayerNameMap } from './player-name-map';

type EventLike = {
  event_type: string;
  payload: unknown;
};

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

function batterName(map: PlayerNameMap, p: { batterId?: string; opponentBatterId?: string }): string {
  return formatPlayer(map, p.batterId ?? p.opponentBatterId ?? null);
}

function runnerName(map: PlayerNameMap, p: { runnerId?: string }): string {
  return formatPlayer(map, p.runnerId ?? null);
}

export function formatEventTicker(event: EventLike, names: PlayerNameMap): string | null {
  const payload = (event.payload ?? {}) as unknown;

  switch (event.event_type) {
    case EventType.HIT: {
      const p = payload as HitPayload;
      const label = HIT_LABELS[p.hitType] ?? 'hit';
      const who = batterName(names, p);
      return who === '—' ? label.charAt(0).toUpperCase() + label.slice(1) : `${who} — ${label}`;
    }
    case EventType.WALK: {
      const p = payload as { batterId?: string; opponentBatterId?: string };
      const who = batterName(names, p);
      return who === '—' ? 'Walk' : `${who} — walk`;
    }
    case EventType.HIT_BY_PITCH: {
      const p = payload as { batterId?: string; opponentBatterId?: string };
      const who = batterName(names, p);
      return who === '—' ? 'Hit by pitch' : `${who} — hit by pitch`;
    }
    case EventType.STRIKEOUT: {
      const p = payload as { batterId?: string; opponentBatterId?: string };
      const who = batterName(names, p);
      return who === '—' ? 'Strikeout' : `${who} — strikeout`;
    }
    case EventType.OUT: {
      const p = payload as OutPayload;
      const who = batterName(names, p);
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
      const who = runnerName(names, p);
      const base = BASE_NAMES[p.toBase] ?? 'next base';
      return who === '—' ? `Stolen base (${base})` : `${who} steals ${base}`;
    }
    case EventType.CAUGHT_STEALING: {
      const p = payload as BaserunnerMovePayload;
      const who = runnerName(names, p);
      const base = BASE_NAMES[p.toBase] ?? '';
      return who === '—' ? 'Caught stealing' : `${who} caught stealing${base ? ` ${base}` : ''}`;
    }
    case EventType.BASERUNNER_ADVANCE: {
      const p = payload as BaserunnerMovePayload;
      const who = runnerName(names, p);
      const dest = p.toBase === 4 ? 'scores' : `to ${BASE_NAMES[p.toBase] ?? 'next'}`;
      return who === '—' ? `Runner ${dest}` : `${who} ${dest}`;
    }
    case EventType.BASERUNNER_OUT: {
      const p = payload as BaserunnerMovePayload;
      const who = runnerName(names, p);
      return who === '—' ? 'Runner out' : `${who} out on the basepaths`;
    }
    case EventType.PICKOFF_ATTEMPT: {
      const p = payload as { runnerId: string; outcome?: 'safe' | 'out'; base: number };
      const who = formatPlayer(names, p.runnerId);
      if (p.outcome === 'out') return who === '—' ? 'Picked off' : `${who} picked off`;
      return null;
    }
    case EventType.SCORE: {
      const p = payload as ScorePayload;
      const who = formatPlayer(names, p.scoringPlayerId);
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
      const incoming = formatPlayer(names, p.inPlayerId);
      return incoming === '—' ? 'Substitution' : `${incoming} subs in`;
    }
    case EventType.PITCHING_CHANGE: {
      const p = payload as PitchingChangePayload;
      const incoming = formatPlayer(names, p.newPitcherId);
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
    // Correction events shouldn't surface as the "Last play" line — the
    // caller should walk back to the previous renderable event.
    case EventType.PITCH_REVERTED: return null;
    case EventType.EVENT_VOIDED: return null;
    default: return null;
  }
}
