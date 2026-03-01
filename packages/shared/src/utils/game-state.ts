import { EventType, type GameEvent, type PitchThrownPayload, type HitPayload, type SubstitutionPayload, type PitchingChangePayload, type ScorePayload } from '../types/game-event';
import type { LiveGameState } from '../types/game';
import { BALLS_FOR_WALK, STRIKES_FOR_STRIKEOUT, OUTS_PER_INNING } from '../constants/baseball';

/**
 * Derives the current live game state by replaying a sorted array of GameEvents.
 * This is a pure function — same inputs always produce the same output.
 * Events must be sorted by sequenceNumber ascending before calling.
 */
export function deriveGameState(
  gameId: string,
  events: GameEvent[],
  homeTeamId: string,
): LiveGameState {
  const state: LiveGameState = {
    gameId,
    inning: 1,
    isTopOfInning: true,
    outs: 0,
    balls: 0,
    strikes: 0,
    homeScore: 0,
    awayScore: 0,
    runnersOnBase: { first: null, second: null, third: null },
    currentBatterId: null,
    currentPitcherId: null,
    currentPitcherPitchCount: 0,
  };

  const pitcherCounts: Record<string, number> = {};

  for (const event of events) {
    switch (event.eventType) {
      case EventType.GAME_START: {
        const p = event.payload as { homeLineupPitcherId?: string; awayLineupPitcherId?: string };
        state.currentPitcherId = state.isTopOfInning
          ? p.homeLineupPitcherId ?? null
          : p.awayLineupPitcherId ?? null;
        break;
      }

      case EventType.PITCH_THROWN: {
        const p = event.payload as PitchThrownPayload;
        state.currentPitcherId = p.pitcherId;
        state.currentBatterId = p.batterId;
        pitcherCounts[p.pitcherId] = (pitcherCounts[p.pitcherId] ?? 0) + 1;
        state.currentPitcherPitchCount = pitcherCounts[p.pitcherId];

        switch (p.outcome) {
          case 'called_strike':
          case 'swinging_strike':
          case 'foul_tip':
            if (state.strikes < STRIKES_FOR_STRIKEOUT - 1) state.strikes++;
            break;
          case 'foul':
            if (state.strikes < STRIKES_FOR_STRIKEOUT - 1) state.strikes++;
            break;
          case 'ball':
          case 'intentional_ball':
            state.balls++;
            break;
          case 'hit_by_pitch':
            // Batter advances to first; handled by HIT_BY_PITCH event
            state.balls = 0;
            state.strikes = 0;
            break;
          case 'in_play':
            // Outcome determined by subsequent HIT / OUT / etc. event
            break;
        }
        break;
      }

      case EventType.WALK:
      case EventType.HIT_BY_PITCH: {
        // Force advance: only runners whose path is blocked by the batter move
        state.runnersOnBase = forceAdvanceRunners(state.runnersOnBase, state.currentBatterId);
        state.balls = 0;
        state.strikes = 0;
        break;
      }

      case EventType.HIT: {
        const p = event.payload as HitPayload;
        const bases = hitTypeToBases(p.hitType);
        if (bases === 4) {
          // Home run: clear bases, score everyone
          const runners = Object.values(state.runnersOnBase).filter(Boolean).length;
          const runs = runners + 1;
          addRuns(state, runs, state.isTopOfInning);
          state.runnersOnBase = { first: null, second: null, third: null };
        } else {
          state.runnersOnBase = advanceRunners(state.runnersOnBase, state.currentBatterId, bases);
        }
        state.balls = 0;
        state.strikes = 0;
        break;
      }

      case EventType.SCORE: {
        const p = event.payload as ScorePayload;
        addRuns(state, p.rbis, state.isTopOfInning);
        break;
      }

      case EventType.OUT:
      case EventType.STRIKEOUT: {
        state.outs++;
        state.balls = 0;
        state.strikes = 0;
        if (state.outs >= OUTS_PER_INNING) {
          // Inning over — will be finalized by INNING_CHANGE event
        }
        break;
      }

      case EventType.INNING_CHANGE: {
        state.outs = 0;
        state.balls = 0;
        state.strikes = 0;
        state.runnersOnBase = { first: null, second: null, third: null };
        if (state.isTopOfInning) {
          state.isTopOfInning = false;
        } else {
          state.isTopOfInning = true;
          state.inning++;
        }
        break;
      }

      case EventType.PITCHING_CHANGE: {
        const p = event.payload as PitchingChangePayload;
        state.currentPitcherId = p.newPitcherId;
        state.currentPitcherPitchCount = pitcherCounts[p.newPitcherId] ?? 0;
        break;
      }

      case EventType.SUBSTITUTION: {
        const p = event.payload as SubstitutionPayload;
        if (state.currentBatterId === p.outPlayerId) {
          state.currentBatterId = p.inPlayerId;
        }
        // Update runners if substituted player is on base
        const { runnersOnBase } = state;
        if (runnersOnBase.first === p.outPlayerId) runnersOnBase.first = p.inPlayerId;
        if (runnersOnBase.second === p.outPlayerId) runnersOnBase.second = p.inPlayerId;
        if (runnersOnBase.third === p.outPlayerId) runnersOnBase.third = p.inPlayerId;
        break;
      }
    }
  }

  return state;
}

function hitTypeToBases(hitType: string): number {
  switch (hitType) {
    case 'single': return 1;
    case 'double': return 2;
    case 'triple': return 3;
    case 'home_run': return 4;
    default: return 1;
  }
}

function advanceRunners(
  runners: LiveGameState['runnersOnBase'],
  batterId: string | null,
  bases: number,
): LiveGameState['runnersOnBase'] {
  // All runners advance the same number of bases as the batter (standard hit model).
  // Runners reaching home plate score — cleared here, tracked via explicit SCORE events.
  const result: LiveGameState['runnersOnBase'] = { first: null, second: null, third: null };

  if (runners.second) {
    const dest = 2 + bases;
    if (dest === 3) result.third = runners.second;
    // dest >= 4: runner scores, stays null in result
  }
  if (runners.first) {
    const dest = 1 + bases;
    if (dest === 2) result.second = runners.first;
    else if (dest === 3) result.third = runners.first;
    // dest >= 4: runner scores, stays null in result
  }

  // Place batter at the correct base
  if (bases === 1) result.first = batterId;
  else if (bases === 2) result.second = batterId;
  else if (bases === 3) result.third = batterId;
  // bases === 4 (home run) is handled separately in the HIT case

  return result;
}

function forceAdvanceRunners(
  runners: LiveGameState['runnersOnBase'],
  batterId: string | null,
): LiveGameState['runnersOnBase'] {
  // Walk / HBP: only runners forced by the batter taking first base advance.
  // A runner is forced only if every base between them and home is occupied.
  const updated = { ...runners };
  if (updated.first && updated.second && updated.third) {
    updated.third = null; // runner on 3rd scores
    updated.third = updated.second;
    updated.second = updated.first;
    updated.first = batterId;
  } else if (updated.first && updated.second) {
    updated.third = updated.second;
    updated.second = updated.first;
    updated.first = batterId;
  } else if (updated.first) {
    updated.second = updated.first;
    updated.first = batterId;
  } else {
    updated.first = batterId;
  }
  return updated;
}

function addRuns(state: LiveGameState, runs: number, isOffensiveTeamTop: boolean): void {
  if (isOffensiveTeamTop) {
    state.awayScore += runs;
  } else {
    state.homeScore += runs;
  }
}
