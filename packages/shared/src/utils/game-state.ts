import { EventType, type GameEvent, type PitchThrownPayload, type HitPayload, type SubstitutionPayload, type PitchingChangePayload, type BaserunnerMovePayload, type PickoffPayload, type RundownPayload, type DroppedThirdStrikePayload } from '../types/game-event';
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
    completedTopHalfPAs: 0,
    completedBottomHalfPAs: 0,
  };

  const pitcherCounts: Record<string, number> = {};

  for (const event of events) {
    switch (event.eventType) {
      case EventType.GAME_START: {
        const p = event.payload as {
          homeLineupPitcherId?: string;
          awayLineupPitcherId?: string;
          homeLeadoffBatterId?: string;
          awayLeadoffBatterId?: string;
        };
        state.currentPitcherId = state.isTopOfInning
          ? p.homeLineupPitcherId ?? null
          : p.awayLineupPitcherId ?? null;
        // Top of first: away team bats, so the away leadoff is current.
        // Bottom of first (or when replay starts mid-inning): home leadoff.
        state.currentBatterId = state.isTopOfInning
          ? p.awayLeadoffBatterId ?? null
          : p.homeLeadoffBatterId ?? null;
        break;
      }

      case EventType.PITCH_THROWN: {
        const p = event.payload as PitchThrownPayload;
        const pitcherId = p.pitcherId ?? p.opponentPitcherId ?? null;
        const batterId  = p.batterId  ?? p.opponentBatterId  ?? null;
        state.currentPitcherId = pitcherId;
        state.currentBatterId  = batterId;
        if (pitcherId) {
          pitcherCounts[pitcherId] = (pitcherCounts[pitcherId] ?? 0) + 1;
          state.currentPitcherPitchCount = pitcherCounts[pitcherId];
        }

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
      case EventType.HIT_BY_PITCH:
      case EventType.CATCHER_INTERFERENCE: {
        // Per OBR 9.04(a)(2), bases-loaded walk / HBP / catcher interference
        // force in a run. Same state transition in all three cases: batter
        // reaches first, runners advance when forced.
        const walkBasesLoaded = !!(
          state.runnersOnBase.first &&
          state.runnersOnBase.second &&
          state.runnersOnBase.third
        );
        state.runnersOnBase = forceAdvanceRunners(state.runnersOnBase, state.currentBatterId);
        if (walkBasesLoaded) addRuns(state, 1, state.isTopOfInning);
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
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
          // Count runners who reach home on this hit before advancing the base state.
          // Runner on 3rd always scores on any hit (3+bases >= 4 for all single/double/triple).
          // Runner on 2nd scores on a double or triple (2+bases >= 4).
          // Runner on 1st scores only on a triple (1+bases >= 4).
          let runs = 0;
          if (state.runnersOnBase.third)                    runs++;
          if (state.runnersOnBase.second && 2 + bases >= 4) runs++;
          if (state.runnersOnBase.first  && 1 + bases >= 4) runs++;
          if (runs > 0) addRuns(state, runs, state.isTopOfInning);
          state.runnersOnBase = advanceRunners(state.runnersOnBase, state.currentBatterId, bases);
        }
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.SCORE: {
        // Each SCORE event represents exactly 1 run scored (rbis tracks RBI credit,
        // which may be 0 for balks/wild pitches, but the run still counts).
        // No run can score after the 3rd out of a half-inning.
        if (state.outs < OUTS_PER_INNING) {
          addRuns(state, 1, state.isTopOfInning);
        }
        break;
      }

      case EventType.FIELD_ERROR: {
        // Batter reaches base on the error — force-advance any runners already
        // on base (same logic as a walk) and place batter on first.
        // If bases were loaded, the runner on third is forced home.
        const errorBasesLoaded = !!(
          state.runnersOnBase.first &&
          state.runnersOnBase.second &&
          state.runnersOnBase.third
        );
        state.runnersOnBase = forceAdvanceRunners(state.runnersOnBase, state.currentBatterId);
        if (errorBasesLoaded) addRuns(state, 1, state.isTopOfInning);
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.OUT:
      case EventType.STRIKEOUT: {
        state.outs++;
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.DROPPED_THIRD_STRIKE: {
        const p = event.payload as DroppedThirdStrikePayload;
        if (p.outcome === 'thrown_out') {
          state.outs++;
        } else {
          // Batter reaches first — force-advance runners
          const basesLoaded = !!(
            state.runnersOnBase.first &&
            state.runnersOnBase.second &&
            state.runnersOnBase.third
          );
          state.runnersOnBase = forceAdvanceRunners(state.runnersOnBase, state.currentBatterId);
          if (basesLoaded) addRuns(state, 1, state.isTopOfInning);
        }
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.SACRIFICE_BUNT: {
        // Per OBR 9.08(a): a sac bunt's purpose is to advance one or more
        // runners at the cost of the batter's out. The common pattern is
        // every runner advances one base (squeeze play scores the runner
        // from third). Uncommon double-advances require manual
        // BASERUNNER_ADVANCE events.
        state.outs++;
        if (state.runnersOnBase.third && state.outs < OUTS_PER_INNING) {
          addRuns(state, 1, state.isTopOfInning);
        }
        state.runnersOnBase = {
          third: state.runnersOnBase.second,
          second: state.runnersOnBase.first,
          first: null,
        };
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.SACRIFICE_FLY: {
        state.outs++;
        // Runner on 3rd scores on sac fly (if fewer than 3 outs)
        if (state.runnersOnBase.third && state.outs < OUTS_PER_INNING) {
          addRuns(state, 1, state.isTopOfInning);
          state.runnersOnBase = { ...state.runnersOnBase, third: null };
        }
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.DOUBLE_PLAY: {
        // Batter is the first out and the forced runner (usually from 1st
        // on a standard 6-4-3 GIDP) is the second. When the scorer has
        // captured runnerOutBase on the payload, clear that specific
        // runner from base state; otherwise just bump the out counter
        // (legacy events may have no runner attribution).
        state.outs = Math.min(state.outs + 2, OUTS_PER_INNING);
        const p = event.payload as { runnerOutBase?: 1 | 2 | 3 };
        if (p.runnerOutBase === 1) state.runnersOnBase = { ...state.runnersOnBase, first: null };
        else if (p.runnerOutBase === 2) state.runnersOnBase = { ...state.runnersOnBase, second: null };
        else if (p.runnerOutBase === 3) state.runnersOnBase = { ...state.runnersOnBase, third: null };
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.TRIPLE_PLAY: {
        state.outs = Math.min(state.outs + 3, OUTS_PER_INNING);
        state.balls = 0;
        state.strikes = 0;
        incrementPA(state);
        break;
      }

      case EventType.INNING_CHANGE: {
        state.outs = 0;
        state.balls = 0;
        state.strikes = 0;
        state.runnersOnBase = { first: null, second: null, third: null };
        // Clear stale pitcher — the next PITCH_THROWN or PITCHING_CHANGE
        // will set the correct pitcher for the new half-inning.
        state.currentPitcherId = null;
        state.currentPitcherPitchCount = 0;
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

      case EventType.STOLEN_BASE:
      case EventType.BASERUNNER_ADVANCE: {
        const p = event.payload as unknown as BaserunnerMovePayload;
        const runners = { ...state.runnersOnBase };
        // Remove from old base
        if (p.fromBase === 1) runners.first  = null;
        else if (p.fromBase === 2) runners.second = null;
        else if (p.fromBase === 3) runners.third  = null;
        // Place on new base (toBase 4 = scored; cleared from diamond, SCORE event adds the run)
        if (p.toBase === 2) runners.second = p.runnerId;
        else if (p.toBase === 3) runners.third  = p.runnerId;
        state.runnersOnBase = runners;
        break;
      }

      case EventType.BASERUNNER_OUT: {
        // A specific runner is called out (e.g., on a fielder's choice).
        // The batter's PA is handled by a subsequent HIT event, so do NOT
        // reset balls/strikes or increment PA here.
        const p = event.payload as Record<string, unknown>;
        const runnerId = p.runnerId as string;
        const runners = { ...state.runnersOnBase };
        if (runners.first  === runnerId) runners.first  = null;
        else if (runners.second === runnerId) runners.second = null;
        else if (runners.third  === runnerId) runners.third  = null;
        state.runnersOnBase = runners;
        state.outs++;
        break;
      }

      case EventType.CAUGHT_STEALING: {
        const p = event.payload as unknown as BaserunnerMovePayload;
        const runners = { ...state.runnersOnBase };
        if (p.fromBase === 1) runners.first  = null;
        else if (p.fromBase === 2) runners.second = null;
        else if (p.fromBase === 3) runners.third  = null;
        state.runnersOnBase = runners;
        state.outs++;
        state.balls = 0;
        state.strikes = 0;
        break;
      }

      case EventType.PICKOFF_ATTEMPT: {
        const p = event.payload as unknown as PickoffPayload;
        if (p.outcome === 'out') {
          const runners = { ...state.runnersOnBase };
          if (p.base === 1) runners.first  = null;
          else if (p.base === 2) runners.second = null;
          else if (p.base === 3) runners.third  = null;
          state.runnersOnBase = runners;
          state.outs++;
        }
        // outcome === 'safe' — no state change
        break;
      }

      case EventType.RUNDOWN: {
        const p = event.payload as unknown as RundownPayload;
        const runners = { ...state.runnersOnBase };
        // Remove runner from starting base
        if (p.startBase === 1) runners.first  = null;
        else if (p.startBase === 2) runners.second = null;
        else if (p.startBase === 3) runners.third  = null;

        if (p.outcome === 'out') {
          state.outs++;
        } else if (p.outcome === 'safe') {
          // safeAtBase is required by the discriminated union when outcome === 'safe'
          if (p.safeAtBase === 1) runners.first  = p.runnerId;
          else if (p.safeAtBase === 2) runners.second = p.runnerId;
          else if (p.safeAtBase === 3) runners.third  = p.runnerId;
        }
        state.runnersOnBase = runners;
        break;
      }

      case EventType.BALK: {
        // All runners advance one base; runner on 3rd scores via subsequent SCORE event
        const runners = { ...state.runnersOnBase };
        runners.third  = runners.second;
        runners.second = runners.first;
        runners.first  = null;
        state.runnersOnBase = runners;
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
  // Runners who reach home plate are cleared here; runs are counted by the HIT case before calling this.
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
    // runner on 3rd scores (run counted by caller)
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

function incrementPA(state: LiveGameState): void {
  if (state.isTopOfInning) {
    state.completedTopHalfPAs++;
  } else {
    state.completedBottomHalfPAs++;
  }
}

function addRuns(state: LiveGameState, runs: number, isOffensiveTeamTop: boolean): void {
  if (isOffensiveTeamTop) {
    state.awayScore += runs;
  } else {
    state.homeScore += runs;
  }
}
