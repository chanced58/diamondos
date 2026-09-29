/**
 * Shared line score computation from raw game events.
 * Derives runs, hits, and errors per inning by replaying the event stream.
 *
 * Events should already be filtered through applyPitchReverted / game_reset
 * before being passed to this function.
 *
 * Runner movement on a hit and its linked runner outcomes follows the shared
 * rule in rules/play-runners (the same one deriveGameState uses), so a runner
 * held, advanced or thrown out on a hit is never counted as scoring by default.
 */
import {
  applyLinkedAdvance,
  applyPlayToRunners,
  applyRunnerOut,
  collectLinkedRunnerOutcomes,
  type Bases,
} from '../rules/play-runners';

export interface LineScoreData {
  awayRunsByInning: number[];
  homeRunsByInning: number[];
  awayRuns: number;
  homeRuns: number;
  awayHits: number;
  homeHits: number;
  awayErrors: number;
  homeErrors: number;
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

/**
 * Runs, hits and errors per inning and in total for both teams, from the
 * event log (snake_case rows). Feeds the scoreboards and the final score
 * written at finalize.
 */
export function computeLineScore(events: Record<string, unknown>[]): LineScoreData {
  let isTopOfInning = true;
  let currentInning = 1;
  let outs = 0;

  // Track base runners (true = occupied) so we can count runs from hits/walks/errors
  let first: string | null = null;
  let second: string | null = null;
  let third: string | null = null;

  const linkedOutcomes = collectLinkedRunnerOutcomes(events as { event_type?: string; payload?: unknown }[]);
  const runnerId = (runner: string) => runner;
  const currentBases = (): Bases<string> => ({ first, second, third });
  const setBases = (next: Bases<string>) => {
    first = next.first; second = next.second; third = next.third;
  };

  const awayRunsByInning: number[] = [0];
  const homeRunsByInning: number[] = [0];
  let awayRuns = 0, homeRuns = 0;
  let awayHits = 0, homeHits = 0;
  let awayErrors = 0, homeErrors = 0;

  function scoreRun(count: number) {
    if (count <= 0) return;
    if (isTopOfInning) {
      awayRunsByInning[currentInning - 1] = (awayRunsByInning[currentInning - 1] ?? 0) + count;
      awayRuns += count;
    } else {
      homeRunsByInning[currentInning - 1] = (homeRunsByInning[currentInning - 1] ?? 0) + count;
      homeRuns += count;
    }
  }

  function forceAdvance(batterId: string) {
    // Bases-loaded force: runner on 3rd scores
    if (first && second && third) {
      scoreRun(1);
      // third scores, everyone shifts up, batter to first
      third = second; second = first; first = batterId;
    } else if (first && second) {
      third = second; second = first; first = batterId;
    } else if (first) {
      second = first; first = batterId;
    } else {
      first = batterId;
    }
  }

  function clearBases() {
    first = null; second = null; third = null;
  }

  // Clear runner at a specific base number
  function clearBase(base: number) {
    if (base === 1) first = null;
    else if (base === 2) second = null;
    else if (base === 3) third = null;
  }

  for (const event of events) {
    const etype = event.event_type as string;
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    if (etype === 'inning_change') {
      if (isTopOfInning) {
        isTopOfInning = false;
      } else {
        isTopOfInning = true;
        currentInning++;
        if (awayRunsByInning.length < currentInning) awayRunsByInning.push(0);
        if (homeRunsByInning.length < currentInning) homeRunsByInning.push(0);
      }
      outs = 0;
      clearBases();
    } else if (etype === 'hit') {
      if (isTopOfInning) awayHits++;
      else homeHits++;

      const batterId = (payload.batterId ?? payload.opponentBatterId ?? 'unknown') as string;
      const bases = hitBases(payload.hitType as string) as 1 | 2 | 3 | 4;
      const played = applyPlayToRunners(
        currentBases(),
        { kind: 'hit', bases },
        batterId,
        linkedOutcomes.get(event.id as string),
        runnerId,
      );
      scoreRun(played.runs);
      setBases(played.runners);
    } else if (etype === 'walk' || etype === 'hit_by_pitch') {
      const batterId = (payload.batterId ?? payload.opponentBatterId ?? 'unknown') as string;
      forceAdvance(batterId);
    } else if (etype === 'field_error') {
      if (isTopOfInning) homeErrors++;
      else awayErrors++;
      const batterId = (payload.batterId ?? payload.opponentBatterId ?? 'unknown') as string;
      forceAdvance(batterId);
    } else if (etype === 'out' || etype === 'strikeout' || etype === 'dropped_third_strike') {
      // Track outs — dropped_third_strike only counts as out when thrown_out
      if (etype === 'dropped_third_strike') {
        if (payload.outcome === 'thrown_out') {
          outs++;
        } else {
          // Batter reaches first — force-advance runners
          const batterId = (payload.batterId ?? payload.opponentBatterId ?? 'unknown') as string;
          forceAdvance(batterId);
        }
      } else {
        outs++;
      }
    } else if (etype === 'double_play') {
      outs += 2;
      const runnerOutBase = payload.runnerOutBase as number | undefined;
      if (runnerOutBase === 1) first = null;
      else if (runnerOutBase === 2) second = null;
      else if (runnerOutBase === 3) third = null;
    } else if (etype === 'triple_play') {
      outs += 3;
    } else if (etype === 'score') {
      // Explicit score events (stolen home, runner advance, balk).
      // No run can score after the 3rd out of a half-inning.
      if (outs < 3) scoreRun(1);
    } else if (etype === 'sacrifice_fly' || etype === 'sacrifice_bunt') {
      outs++;
      // OBR 9.08: sac bunt moves everyone up one (squeeze scores); sac fly
      // scores the runner from 3rd. Runners with a linked outcome are left to it.
      const played = applyPlayToRunners(
        currentBases(),
        { kind: etype === 'sacrifice_fly' ? 'sac_fly' : 'sac_bunt' },
        null,
        linkedOutcomes.get(event.id as string),
        runnerId,
      );
      if (outs < 3) {
        scoreRun(played.runs);
        setBases(played.runners);
      }
    } else if (etype === 'stolen_base') {
      const toBase = payload.toBase as number | undefined;
      const runnerId = payload.runnerId as string | undefined;
      if (toBase === 4 && third) {
        // Stolen home — already counted via separate 'score' event
        third = null;
      } else if (toBase === 3 && second) {
        third = second; second = null;
      } else if (toBase === 2 && first) {
        second = first; first = null;
      }
      // If we have a runnerId, ensure old base is cleared for non-standard advances
      if (runnerId) {
        const fromBase = payload.fromBase as number | undefined;
        if (fromBase === 1 && first === runnerId) first = null;
        else if (fromBase === 2 && second === runnerId) second = null;
        else if (fromBase === 3 && third === runnerId) third = null;
      }
    } else if (etype === 'caught_stealing') {
      outs++;
      const fromBase = payload.fromBase as number | undefined;
      if (fromBase === 3) third = null;
      else if (fromBase === 2) second = null;
      else if (fromBase === 1) first = null;
    } else if (etype === 'baserunner_advance' && typeof payload.runnerId === 'string') {
      // Toward home places nothing — the accompanying 'score' event counts the run.
      setBases(applyLinkedAdvance(currentBases(), payload, payload.runnerId, runnerId));
    } else if (etype === 'baserunner_advance') {
      // Legacy advance with no runner id: clear the named base, place a stand-in.
      const toBase = payload.toBase as number | undefined;
      const fromBase = payload.fromBase as number | undefined;
      const runnerId = payload.runnerId as string | undefined;
      if (toBase === 4) {
        // Runner scored — already counted via separate 'score' event
        if (fromBase === 3) third = null;
        else if (fromBase === 2) second = null;
        else if (fromBase === 1) first = null;
      } else {
        if (fromBase === 1) { first = null; if (toBase === 2) second = runnerId ?? 'unknown'; else if (toBase === 3) third = runnerId ?? 'unknown'; }
        if (fromBase === 2) { second = null; if (toBase === 3) third = runnerId ?? 'unknown'; }
      }
    } else if (etype === 'baserunner_out') {
      outs++;
      if (typeof payload.runnerId === 'string') setBases(applyRunnerOut(currentBases(), payload, runnerId));
    } else if (etype === 'pickoff_attempt') {
      const outcome = payload.outcome as string | undefined;
      if (outcome === 'out') {
        outs++;
        const base = payload.base as number | undefined;
        if (base) clearBase(base);
      }
    } else if (etype === 'rundown') {
      const startBase = payload.startBase as number | undefined;
      const outcome = payload.outcome as string | undefined;
      const runnerId = payload.runnerId as string | undefined;
      if (startBase) clearBase(startBase);
      if (outcome === 'out') outs++;
      if (outcome === 'safe') {
        const safeAtBase = payload.safeAtBase as number | undefined;
        if (safeAtBase === 1) first = runnerId ?? 'unknown';
        else if (safeAtBase === 2) second = runnerId ?? 'unknown';
        else if (safeAtBase === 3) third = runnerId ?? 'unknown';
      }
    } else if (etype === 'balk') {
      // Advance runners; the run is credited by the subsequent SCORE event
      // recorded by the mobile scoring app.
      if (third) third = null;
      third = second;
      second = first;
      first = null;
    }
  }

  // Pad arrays to equal length
  const maxLen = Math.max(awayRunsByInning.length, homeRunsByInning.length);
  while (awayRunsByInning.length < maxLen) awayRunsByInning.push(0);
  while (homeRunsByInning.length < maxLen) homeRunsByInning.push(0);

  return {
    awayRunsByInning, homeRunsByInning,
    awayRuns, homeRuns,
    awayHits, homeHits,
    awayErrors, homeErrors,
  };
}
