import {
  EventType,
  PitchOutcome,
  type GameEvent,
  type PitchThrownPayload,
  type HitPayload,
  type OutPayload,
  type PitchingChangePayload,
} from '../types/game-event';
import { OUTS_PER_INNING } from '../constants/baseball';
import type { CountStat, PitchingStats } from '../types/pitching';

// All 12 valid ball-strike counts
const ALL_COUNTS = [
  '0-0', '0-1', '0-2',
  '1-0', '1-1', '1-2',
  '2-0', '2-1', '2-2',
  '3-0', '3-1', '3-2',
] as const;

function makeEmptyCountStats(): Record<string, CountStat> {
  const record: Record<string, CountStat> = {};
  for (const key of ALL_COUNTS) {
    record[key] = { atBats: 0, hits: 0, average: NaN };
  }
  return record;
}

function makeEmptyStats(playerId: string, playerName: string): PitchingStats {
  return {
    playerId,
    playerName,
    gamesAppeared: 0,
    inningsPitchedOuts: 0,
    totalPitches: 0,
    strikes: 0,
    balls: 0,
    strikePercentage: 0,
    firstPitchStrikes: 0,
    firstPitchStrikePercentage: 0,
    threeBallCountPAs: 0,
    threeZeroCountPAs: 0,
    totalPAs: 0,
    threeBallCountPercentage: 0,
    threeZeroCountPercentage: 0,
    hitsAllowed: 0,
    runsAllowed: 0,
    earnedRunsAllowed: 0,
    walksAllowed: 0,
    strikeouts: 0,
    hitBatters: 0,
    wildPitches: 0,
    era: Infinity,
    whip: Infinity,
    strikeoutsPerSeven: 0,
    walksPerSeven: 0,
    baByCount: makeEmptyCountStats(),
  };
}

function isStrikeOutcome(outcome: PitchOutcome): boolean {
  return (
    outcome === PitchOutcome.CALLED_STRIKE ||
    outcome === PitchOutcome.SWINGING_STRIKE ||
    outcome === PitchOutcome.FOUL_TIP
  );
}

function isBallOutcome(outcome: PitchOutcome): boolean {
  return (
    outcome === PitchOutcome.BALL ||
    outcome === PitchOutcome.INTENTIONAL_BALL ||
    outcome === PitchOutcome.HIT_BY_PITCH
  );
}

/** Returns innings pitched as a decimal (e.g. 6.333... for 19 outs). */
function inningsPitched(outs: number): number {
  return outs / 3;
}

/** Format innings pitched as the conventional "6.1" display string. */
export function formatInningsPitched(outs: number): string {
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

/** Format a batting average (0–1) as ".XXX", or "---" when NaN/undefined. */
export function formatAverage(avg: number): string {
  if (!isFinite(avg) || isNaN(avg)) return '---';
  return avg.toFixed(3).replace(/^0/, '');
}

/**
 * Derive season pitching statistics for all pitchers from an ordered list of
 * game events. Events must be sorted by (game_id, sequence_number) ascending.
 *
 * @param events  All game events for the season (filtered to relevant types).
 * @param players Name lookup map for player IDs.
 * @returns A map from playerId → PitchingStats.
 */
export function derivePitchingStats(
  events: GameEvent[],
  players: { id: string; firstName: string; lastName: string }[],
): Map<string, PitchingStats> {
  const nameMap = new Map<string, string>(
    players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
  );

  const statsMap = new Map<string, PitchingStats>();

  function getStats(pitcherId: string): PitchingStats {
    if (!statsMap.has(pitcherId)) {
      const name = nameMap.get(pitcherId) ?? 'Unknown';
      statsMap.set(pitcherId, makeEmptyStats(pitcherId, name));
    }
    return statsMap.get(pitcherId)!;
  }

  // Group events by game_id preserving their sequence order
  const gameMap = new Map<string, GameEvent[]>();
  for (const event of events) {
    const gameId = (event as any).game_id ?? event.gameId;
    if (!gameMap.has(gameId)) gameMap.set(gameId, []);
    gameMap.get(gameId)!.push(event);
  }

  for (const gameEvents of gameMap.values()) {
    // Sort by sequence number within each game (should already be sorted,
    // but guard against any ordering issues)
    gameEvents.sort((a, b) => {
      const aSeq = (a as any).sequence_number ?? a.sequenceNumber;
      const bSeq = (b as any).sequence_number ?? b.sequenceNumber;
      return aSeq - bSeq;
    });

    // Track which pitchers appeared in this game
    const appearedThisGame = new Set<string>();

    // Current pitcher on the mound for the active half-inning
    let currentPitcherId: string | null = null;

    // Cache of each side's most recently named starting pitcher, captured from
    // GAME_START and updated by PITCHING_CHANGE. Lets INNING_CHANGE restore
    // currentPitcherId for the new defending team even when subsequent events
    // carry the legacy 'unknown-pitcher' stub or omit pitcherId entirely
    // (which is the failure mode that left the Notus Pirates game's IP blank
    // — see commit a071a02 for the upstream stub removal).
    let homeStartingPitcher: string | null = null;
    let awayStartingPitcher: string | null = null;
    let isTopOfInning = true;

    // Normalize a pitcher id field: treat the legacy 'unknown-pitcher' stub
    // (and other falsy values) as null. Anything stored into currentPitcherId
    // or the side caches must go through this so a stub never poisons state
    // and then leaks back out via the resolvePitcher fallback.
    const normalizePitcherId = (id: string | null | undefined): string | null =>
      id && id !== 'unknown-pitcher' ? id : null;

    // Resolve the pitcher for an event:
    //   • prefer the payload field, but treat the legacy stub
    //     'unknown-pitcher' as missing — same convention as the new emit path
    //     (a071a02) which omits the field entirely
    //   • fall back to currentPitcherId tracked across the replay so out
    //     events without a payload pitcher still attribute to whoever's on
    //     the mound
    // Arrow expression (not a function declaration) so it doesn't trigger
    // `no-inner-declarations` while still closing over currentPitcherId.
    const resolvePitcher = (rawId: string | null | undefined): string | null => {
      const real = normalizePitcherId(rawId);
      return real ?? currentPitcherId;
    };

    // Set by pitch progression when a strikeout is detected via ab.strikes >= 3,
    // so the subsequent explicit STRIKEOUT event can skip redundant stat updates.
    let strikeoutHandledByPitch = false;

    // Set by pitch progression when a walk is detected via ab.balls >= 4,
    // so the subsequent explicit WALK event can skip redundant walksAllowed increment.
    let walkCountedByPitch = false;

    // ── Base-runner tracking for run attribution to pitchers ────────────────
    // Track runner ID + whether they reached on error for earned run distinction
    type RunnerState = { id: string; reachedOnError: boolean } | null;
    let r1: RunnerState = null, r2: RunnerState = null, r3: RunnerState = null;
    function clearRunners() { r1 = null; r2 = null; r3 = null; }

    // Per-half-inning out count (reset on INNING_CHANGE). Distinct from
    // the cumulative `inningsPitchedOuts` stat; used locally to guard the
    // HIT handler's scoreRun() calls when a fielder's choice whose
    // preceding BASERUNNER_OUT was the 3rd out would otherwise charge the
    // pitcher with runs that never counted. Mirrors deriveGameState's
    // HIT guard in packages/shared/src/utils/game-state.ts.
    let outsThisInning = 0;

    /** Score a single run, checking if the runner reached on error (unearned). */
    function scoreRun(runner: RunnerState) {
      if (!currentPitcherId) return;
      const s = getStats(currentPitcherId);
      s.runsAllowed += 1;
      if (!runner?.reachedOnError) s.earnedRunsAllowed += 1;
    }

    /** Score runs without runner context (SCORE events) — conservatively earned. */
    function addRunToPitcher(count = 1) {
      if (currentPitcherId && count > 0) {
        const s = getStats(currentPitcherId);
        s.runsAllowed += count;
        s.earnedRunsAllowed += count;
      }
    }

    function forceAdvanceRunners(batter: RunnerState) {
      if (r1 && r2 && r3) scoreRun(r3); // bases loaded → runner on 3rd scores
      if (r1 && r2) r3 = r2;
      if (r1) r2 = r1;
      r1 = batter;
    }

    // Per-at-bat state for the current pitcher (reset when batter changes)
    // batterId → { balls, strikes, isFirstPitch, reachedThreeBalls, contactCount }
    const atBatState = new Map<
      string,
      {
        balls: number;
        strikes: number;
        pitchNumber: number; // total pitches seen in this at-bat
        isFirstPitch: boolean;
        reachedThreeBalls: boolean;
        reachedThreeZero: boolean; // first 3 pitches were all balls (3-0 count)
        contactCount: string | null; // count when ball was put in play
      }
    >();

    // We need to correlate IN_PLAY pitch outcomes with subsequent HIT/OUT events.
    // Track the most recent IN_PLAY pitch per batter.
    const pendingContact = new Map<
      string,
      { pitcherId: string; count: string }
    >();

    function resetAtBat(batterId: string) {
      atBatState.set(batterId, {
        balls: 0,
        strikes: 0,
        pitchNumber: 0,
        isFirstPitch: true,
        reachedThreeBalls: false,
        reachedThreeZero: false,
        contactCount: null,
      });
    }

    function getAtBat(batterId: string) {
      if (!atBatState.has(batterId)) resetAtBat(batterId);
      return atBatState.get(batterId)!;
    }

    for (const event of gameEvents) {
      const etype: string = (event as any).event_type ?? event.eventType;
      const payload = event.payload as any;

      // ── Pitching change / game start → update current pitcher ──────────
      if (etype === EventType.PITCHING_CHANGE) {
        const p = payload as PitchingChangePayload;
        const newPitcherId = normalizePitcherId(p.newPitcherId);
        currentPitcherId = newPitcherId;
        // Update the appropriate side's cached starter so a subsequent
        // INNING_CHANGE restores this pitcher (not the original starter).
        // Whichever team is currently *defending* — i.e. the opposite of
        // who's batting — is the one being changed. When isTopOfInning is
        // true, the home team is in the field.
        if (isTopOfInning) {
          homeStartingPitcher = newPitcherId;
        } else {
          awayStartingPitcher = newPitcherId;
        }
        // Clear at-bat state on pitching change (new pitcher inherits runners but not count)
        atBatState.clear();
        pendingContact.clear();
      }

      if (etype === EventType.GAME_START) {
        homeStartingPitcher = normalizePitcherId(payload?.homeLineupPitcherId as string | undefined);
        awayStartingPitcher = normalizePitcherId(payload?.awayLineupPitcherId as string | undefined);
        // Top of first: home team is in the field (away bats first).
        currentPitcherId = isTopOfInning ? homeStartingPitcher : awayStartingPitcher;
      }

      // ── Inning change → clear at-bat state and rotate to the new
      // ── defending team's starter (cached from GAME_START / PITCHING_CHANGE)
      if (etype === EventType.INNING_CHANGE) {
        atBatState.clear();
        pendingContact.clear();
        clearRunners();
        outsThisInning = 0;
        // Flip the half-inning, then restore currentPitcherId from the cache
        // so out events at the top of the new half (before any PITCH_THROWN
        // re-seeds it) attribute to the right pitcher. If the cache is
        // empty for this side (lineup didn't include a starter), falls
        // back to null and the next real PITCH_THROWN will seed it.
        isTopOfInning = !isTopOfInning;
        currentPitcherId = isTopOfInning ? homeStartingPitcher : awayStartingPitcher;
      }

      // ── PITCH_THROWN ────────────────────────────────────────────────────
      if (etype === EventType.PITCH_THROWN) {
        const p = payload as PitchThrownPayload;
        const rawPitcherId = p.pitcherId ?? p.opponentPitcherId;
        const batterId = p.batterId ?? p.opponentBatterId;
        const { outcome } = p;

        // Update currentPitcherId only when the payload carries a real id —
        // 'unknown-pitcher' must not overwrite the cached real starter that
        // INNING_CHANGE just restored (otherwise the stub pollutes state and
        // every subsequent out attributes to the phantom).
        if (rawPitcherId && rawPitcherId !== 'unknown-pitcher') {
          currentPitcherId = rawPitcherId;
        }
        // Use the resolved pitcher (real payload first, then current state)
        // so legacy 'unknown-pitcher' events still drive stats for whoever
        // the lineup said is on the mound.
        const pitcherId = resolvePitcher(rawPitcherId);

        // Skip if we lack enough context to track stats
        if (!pitcherId || !batterId || !outcome) continue;

        if (!appearedThisGame.has(pitcherId)) {
          appearedThisGame.add(pitcherId);
          getStats(pitcherId).gamesAppeared += 1;
        }

        const s = getStats(pitcherId);
        const ab = getAtBat(batterId);

        s.totalPitches += 1;

        const isStrike =
          isStrikeOutcome(outcome) ||
          outcome === PitchOutcome.FOUL ||
          outcome === PitchOutcome.IN_PLAY;

        if (isStrike) {
          s.strikes += 1;
        } else if (isBallOutcome(outcome)) {
          s.balls += 1;
        }

        // First pitch of this at-bat
        if (ab.isFirstPitch) {
          s.totalPAs += 1;
          if (isStrike) s.firstPitchStrikes += 1;
          ab.isFirstPitch = false;
        }

        if (p.isWildPitch) s.wildPitches += 1;

        ab.pitchNumber += 1;

        const countKey = `${ab.balls}-${ab.strikes}`;

        // ── Advance the count ───────────────────────────────────────────
        if (outcome === PitchOutcome.CALLED_STRIKE || outcome === PitchOutcome.SWINGING_STRIKE || outcome === PitchOutcome.FOUL_TIP) {
          ab.strikes += 1;
        } else if (outcome === PitchOutcome.FOUL) {
          if (ab.strikes < 2) ab.strikes += 1;
          // Foul with 2 strikes doesn't advance
        } else if (outcome === PitchOutcome.BALL || outcome === PitchOutcome.INTENTIONAL_BALL) {
          ab.balls += 1;
          if (ab.balls === 3) {
            ab.reachedThreeBalls = true;
            // 3-0 count: first 3 pitches were all balls (no strikes thrown)
            if (ab.pitchNumber === 3 && ab.strikes === 0) ab.reachedThreeZero = true;
          }
          if (ab.balls >= 4) {
            // Walk — terminal
            s.walksAllowed += 1;
            walkCountedByPitch = true;
            if (ab.reachedThreeBalls) s.threeBallCountPAs += 1;
            if (ab.reachedThreeZero) s.threeZeroCountPAs += 1;
            resetAtBat(batterId);
          }
        } else if (outcome === PitchOutcome.HIT_BY_PITCH) {
          s.hitBatters += 1;
          if (ab.reachedThreeBalls) s.threeBallCountPAs += 1;
          if (ab.reachedThreeZero) s.threeZeroCountPAs += 1;
          resetAtBat(batterId);
        } else if (outcome === PitchOutcome.IN_PLAY) {
          // Ball in play — record pending contact for correlation with HIT/OUT
          pendingContact.set(batterId, { pitcherId, count: countKey });
          if (ab.reachedThreeBalls) s.threeBallCountPAs += 1;
          if (ab.reachedThreeZero) s.threeZeroCountPAs += 1;
          // Don't reset yet — wait for HIT/OUT event
        }

        // Check for strikeout via pitch count (3rd strike).
        // When detected here, we record strikeouts + baByCount and set a flag
        // so the subsequent explicit STRIKEOUT event only adds inningsPitchedOuts.
        if (ab.strikes >= 3) {
          s.strikeouts += 1;
          strikeoutHandledByPitch = true;
          // BA by count: strikeout is an out at the count before the final strike
          const prev = `${ab.balls}-${Math.min(ab.strikes - 1, 2)}`;
          const countStat = s.baByCount[prev] ?? s.baByCount['0-0'];
          if (countStat) {
            countStat.atBats += 1;
            countStat.average = countStat.atBats > 0 ? countStat.hits / countStat.atBats : NaN;
          }
          if (ab.reachedThreeBalls) s.threeBallCountPAs += 1;
          if (ab.reachedThreeZero) s.threeZeroCountPAs += 1;
          resetAtBat(batterId);
        }
      }

      // ── HIT ─────────────────────────────────────────────────────────────
      if (etype === EventType.HIT) {
        const p = payload as HitPayload;
        const pitcherId = resolvePitcher(p.pitcherId ?? p.opponentPitcherId);
        const batterId = p.batterId ?? p.opponentBatterId;
        const fieldersChoice = p.fieldersChoice === true;
        if (pitcherId) {
          if (!appearedThisGame.has(pitcherId)) {
            appearedThisGame.add(pitcherId);
            getStats(pitcherId).gamesAppeared += 1;
          }
          const s = getStats(pitcherId);
          if (!fieldersChoice) s.hitsAllowed += 1;
          const contact = batterId ? pendingContact.get(batterId) : undefined;
          if (contact && contact.pitcherId === pitcherId) {
            const cs = s.baByCount[contact.count];
            if (cs) {
              cs.atBats += 1;
              if (!fieldersChoice) {
                cs.hits += 1;
              }
              cs.average = cs.hits / cs.atBats;
            }
            if (batterId) pendingContact.delete(batterId);
          }
          if (batterId) resetAtBat(batterId);
        }
        // ── Attribute runs from hit to current pitcher ──
        // No runs are charged when the inning is already over (e.g. a
        // fielder's choice whose preceding BASERUNNER_OUT was the 3rd
        // out). Matches deriveGameState's HIT guard.
        if (outsThisInning < OUTS_PER_INNING) {
          const batterId2 = p.batterId ?? p.opponentBatterId ?? 'unknown';
          const batterRunner: RunnerState = { id: batterId2, reachedOnError: false };
          const bases = p.hitType === 'home_run' ? 4
            : p.hitType === 'triple' ? 3
            : p.hitType === 'double' ? 2
            : 1;
          if (bases === 4) {
            // Home run: all runners + batter score
            if (r3) scoreRun(r3);
            if (r2) scoreRun(r2);
            if (r1) scoreRun(r1);
            scoreRun(batterRunner);
            clearRunners();
          } else {
            if (r3) scoreRun(r3);
            if (r2 && 2 + bases >= 4) scoreRun(r2);
            if (r1 && 1 + bases >= 4) scoreRun(r1);
            if (bases === 1) { r3 = (r2 && 2 + bases < 4) ? r2 : null; r2 = (r1 && 1 + bases < 4) ? r1 : null; r1 = batterRunner; }
            else if (bases === 2) { r3 = (r1 && 1 + bases < 4) ? r1 : null; r2 = batterRunner; r1 = null; }
            else if (bases === 3) { r3 = batterRunner; r2 = null; r1 = null; }
          }
        }
      }

      // ── OUT (groundout, flyout, etc.) ────────────────────────────────────
      if (etype === EventType.OUT) {
        const p = payload as OutPayload;
        const pitcherId = resolvePitcher(p.pitcherId ?? p.opponentPitcherId);
        const batterId = p.batterId ?? p.opponentBatterId;
        if (pitcherId) {
          if (!appearedThisGame.has(pitcherId)) {
            appearedThisGame.add(pitcherId);
            getStats(pitcherId).gamesAppeared += 1;
          }
          const s = getStats(pitcherId);
          s.inningsPitchedOuts += 1;
          const contact = batterId ? pendingContact.get(batterId) : undefined;
          if (contact && contact.pitcherId === pitcherId) {
            const cs = s.baByCount[contact.count];
            if (cs) {
              cs.atBats += 1;
              cs.average = cs.atBats > 0 ? cs.hits / cs.atBats : NaN;
            }
            if (batterId) pendingContact.delete(batterId);
          }
          if (batterId) resetAtBat(batterId);
        }
        outsThisInning += 1;
      }

      // ── STRIKEOUT (explicit event) ──────────────────────────────────────
      // Pitch progression (ab.strikes >= 3) handles strikeouts, baByCount,
      // and threeBallCount stats. This handler only adds the out recording.
      // If pitch progression already ran, skip redundant stat updates.
      if (etype === EventType.STRIKEOUT) {
        const pitcherId = resolvePitcher(payload?.pitcherId);
        const batterId: string | undefined = payload?.batterId;
        if (pitcherId) {
          if (!appearedThisGame.has(pitcherId)) {
            appearedThisGame.add(pitcherId);
            getStats(pitcherId).gamesAppeared += 1;
          }
          const s = getStats(pitcherId);
          if (strikeoutHandledByPitch) {
            // Pitch progression already counted the strikeout; just record the out
            s.inningsPitchedOuts += 1;
          } else {
            // No prior pitch data — count both the strikeout and the out
            s.strikeouts += 1;
            s.inningsPitchedOuts += 1;
          }
          if (batterId) resetAtBat(batterId);
        }
        outsThisInning += 1;
        strikeoutHandledByPitch = false;
      }

      // ── DROPPED_THIRD_STRIKE ──────────────────────────────────────────────
      if (etype === EventType.DROPPED_THIRD_STRIKE) {
        const pitcherId = resolvePitcher(payload?.pitcherId);
        const batterId: string | undefined = payload?.batterId;
        if (pitcherId) {
          if (!appearedThisGame.has(pitcherId)) {
            appearedThisGame.add(pitcherId);
            getStats(pitcherId).gamesAppeared += 1;
          }
          const s = getStats(pitcherId);
          // K already counted via pitch progression (ab.strikes >= 3) — do NOT double-count
          if (strikeoutHandledByPitch) {
            if (payload?.outcome === 'thrown_out') {
              s.inningsPitchedOuts += 1;
            }
          } else {
            s.strikeouts += 1;
            if (payload?.outcome === 'thrown_out') {
              s.inningsPitchedOuts += 1;
            }
          }
          if (payload?.isWildPitch) {
            s.wildPitches += 1;
          }
          if (batterId) resetAtBat(batterId);
        }
        if (payload?.outcome === 'thrown_out') {
          outsThisInning += 1;
        }
        strikeoutHandledByPitch = false;
        if (payload?.outcome !== 'thrown_out' && batterId) {
          // Per OBR 9.16(a): runs scored by a runner who reached on an error
          // are unearned. A D3K reached_on_error puts the batter on first via
          // a charged error; track that so any subsequent run is unearned.
          // reached_wild_pitch (WP or PB) is not a charged error here — the
          // batter reached on a pitching/catching lapse, not a fielding error.
          const reachedOnError = payload?.outcome === 'reached_on_error';
          forceAdvanceRunners({ id: batterId, reachedOnError });
        }
      }

      // ── WALK (explicit event) ────────────────────────────────────────────
      // Quick-walk (no preceding PITCH_THROWN events) won't have set
      // walkCountedByPitch, so we must count walksAllowed here and ensure
      // gamesAppeared / totalPAs are tracked for rate denominators.
      if (etype === EventType.WALK) {
        const rawPitcherId: string | undefined = payload?.pitcherId;
        const pitcherId = resolvePitcher(rawPitcherId);
        const batterId: string | undefined = payload?.batterId;
        if (pitcherId) {
          // Update currentPitcherId from any real payload pitcher (no
          // !currentPitcherId guard) so subsequent forceAdvanceRunners /
          // scoreRun calls charge runs to whoever the walk says is on the
          // mound. Mirrors the PITCH_THROWN behavior; the stub check keeps
          // 'unknown-pitcher' from poisoning state.
          const realPayloadPitcher = normalizePitcherId(rawPitcherId);
          if (realPayloadPitcher) currentPitcherId = realPayloadPitcher;
          if (!walkCountedByPitch) {
            // Quick-walk: no PITCH_THROWN preceded this, so gamesAppeared
            // and totalPAs were never incremented for this PA.
            if (!appearedThisGame.has(pitcherId)) {
              appearedThisGame.add(pitcherId);
              getStats(pitcherId).gamesAppeared += 1;
            }
            getStats(pitcherId).totalPAs += 1;
            getStats(pitcherId).walksAllowed += 1;
          }
        }
        if (batterId) resetAtBat(batterId);
        walkCountedByPitch = false;
        forceAdvanceRunners(batterId ? { id: batterId, reachedOnError: false } : null);
      }

      // ── CATCHER_INTERFERENCE ─────────────────────────────────────────────
      // Batter reaches first without charging the pitcher; only the runner
      // state is affected. Per OBR 9.16, catcher interference is a
      // defensive miscue — any run scored by a runner who reached on CI
      // is unearned. Mark reachedOnError=true to match FIELD_ERROR
      // treatment so subsequent scores are classified correctly.
      if (etype === EventType.CATCHER_INTERFERENCE) {
        const batterId: string | undefined = payload?.batterId;
        forceAdvanceRunners(batterId ? { id: batterId, reachedOnError: true } : null);
      }

      // ── HIT_BY_PITCH (explicit event) ────────────────────────────────────
      if (etype === EventType.HIT_BY_PITCH) {
        const rawPitcherId: string | undefined = payload?.pitcherId;
        const pitcherId = resolvePitcher(rawPitcherId);
        const batterId: string | undefined = payload?.batterId;
        if (pitcherId) {
          // Update currentPitcherId from any real payload pitcher (mirrors
          // PITCH_THROWN/WALK so subsequent run attribution stays correct).
          const realPayloadPitcher = normalizePitcherId(rawPitcherId);
          if (realPayloadPitcher) currentPitcherId = realPayloadPitcher;
        }
        if (pitcherId && batterId) {
          resetAtBat(batterId);
        }
        forceAdvanceRunners(batterId ? { id: batterId, reachedOnError: false } : null);
      }

      // ── DOUBLE_PLAY / SACRIFICE → still counts as outs ──────────────────
      if (etype === EventType.DOUBLE_PLAY || etype === EventType.SACRIFICE_BUNT || etype === EventType.SACRIFICE_FLY) {
        const pitcherId = resolvePitcher(payload?.pitcherId);
        const batterId: string | undefined = payload?.batterId;
        // DP retires 2 outs (batter + forced runner); SB/SF retire 1.
        const defaultOuts = etype === EventType.DOUBLE_PLAY ? 2 : 1;
        const outsRecorded: number = payload?.outsRecorded ?? defaultOuts;
        if (pitcherId) {
          if (!appearedThisGame.has(pitcherId)) {
            appearedThisGame.add(pitcherId);
            getStats(pitcherId).gamesAppeared += 1;
          }
          const s = getStats(pitcherId);
          s.inningsPitchedOuts += outsRecorded;
          outsThisInning += outsRecorded;
          if (batterId) {
            // Double plays ARE at-bats; sacrifices are NOT
            if (etype === EventType.DOUBLE_PLAY) {
              const contact = pendingContact.get(batterId);
              if (contact && contact.pitcherId === pitcherId) {
                const cs = s.baByCount[contact.count];
                if (cs) { cs.atBats += 1; cs.average = cs.atBats > 0 ? cs.hits / cs.atBats : NaN; }
              }
            }
            pendingContact.delete(batterId);
            resetAtBat(batterId);
          }
        }
        // Sac bunt: runners advance one base (runner on 3rd scores).
        if (etype === EventType.SACRIFICE_BUNT) {
          if (r3) {
            scoreRun(r3);
          }
          r3 = r2;
          r2 = r1;
          r1 = null;
        }
        // Sac fly: runner on 3rd scores
        if (etype === EventType.SACRIFICE_FLY && r3) {
          scoreRun(r3);
          r3 = null;
        }
        // Double play: remove the named forced runner so earned-run
        // classification stays accurate for the remaining runners.
        if (etype === EventType.DOUBLE_PLAY) {
          const runnerOutBase = payload?.runnerOutBase as 1 | 2 | 3 | undefined;
          if (runnerOutBase === 1) r1 = null;
          else if (runnerOutBase === 2) r2 = null;
          else if (runnerOutBase === 3) r3 = null;
        }
      }

      // ── FIELD_ERROR → batter reaches on error (unearned), force advance ─
      if (etype === EventType.FIELD_ERROR) {
        const pitcherId = resolvePitcher(payload?.pitcherId ?? payload?.opponentPitcherId);
        const batterId: string | undefined = payload?.batterId ?? payload?.opponentBatterId;
        // Field errors ARE at-bats (no hit) — record to BA by count
        if (pitcherId && batterId) {
          const contact = pendingContact.get(batterId);
          if (contact && contact.pitcherId === pitcherId) {
            const cs = getStats(pitcherId).baByCount[contact.count];
            if (cs) { cs.atBats += 1; cs.average = cs.atBats > 0 ? cs.hits / cs.atBats : NaN; }
          }
          pendingContact.delete(batterId);
          resetAtBat(batterId);
        }
        forceAdvanceRunners({ id: batterId ?? 'unknown', reachedOnError: true });
      }

      // ── SCORE (explicit — stolen home, balk, runner advance) ───────────
      if (etype === EventType.SCORE) {
        addRunToPitcher(1);
      }

      // ── STOLEN_BASE / BASERUNNER_ADVANCE → update runner state ─────────
      if (etype === 'stolen_base' || etype === 'baserunner_advance') {
        const toBase: number | undefined = payload?.toBase;
        const fromBase: number | undefined = payload?.fromBase;
        const runnerId: string | undefined = payload?.runnerId;
        // Capture runner's error flag before clearing their old base
        const prev: RunnerState = fromBase === 1 ? r1 : fromBase === 2 ? r2 : fromBase === 3 ? r3 : null;
        if (fromBase === 1) r1 = null;
        else if (fromBase === 2) r2 = null;
        else if (fromBase === 3) r3 = null;
        // Score handled by SCORE event above; just track base state
        const state: RunnerState = { id: runnerId ?? prev?.id ?? 'unknown', reachedOnError: prev?.reachedOnError ?? false };
        if (toBase === 3) r3 = state;
        else if (toBase === 2) r2 = state;
        else if (toBase === 1) r1 = state;
      }

      // ── CAUGHT_STEALING → remove runner ────────────────────────────────
      if (etype === 'caught_stealing') {
        const fromBase: number | undefined = payload?.fromBase;
        if (fromBase === 1) r1 = null;
        else if (fromBase === 2) r2 = null;
        else if (fromBase === 3) r3 = null;
        outsThisInning += 1;
      }

      // ── BASERUNNER_OUT → runner called out (fielder's choice) ──────────
      if (etype === 'baserunner_out') {
        const runnerId: string | undefined = payload?.runnerId;
        if (runnerId) {
          if (r1?.id === runnerId) r1 = null;
          else if (r2?.id === runnerId) r2 = null;
          else if (r3?.id === runnerId) r3 = null;
        }
        outsThisInning += 1;
      }

      // ── PICKOFF_ATTEMPT → remove runner if out ─────────────────────────
      if (etype === 'pickoff_attempt') {
        const outcome: string | undefined = payload?.outcome;
        if (outcome === 'out') {
          const base: number | undefined = payload?.base;
          if (base === 1) r1 = null;
          else if (base === 2) r2 = null;
          else if (base === 3) r3 = null;
          outsThisInning += 1;
        }
      }

      // ── RUNDOWN → remove/move runner based on outcome ──────────────────
      if (etype === 'rundown') {
        const startBase: number | undefined = payload?.startBase;
        const outcome: string | undefined = payload?.outcome;
        const runnerId: string | undefined = payload?.runnerId;
        // Capture runner's error flag before clearing
        const prev: RunnerState = startBase === 1 ? r1 : startBase === 2 ? r2 : startBase === 3 ? r3 : null;
        if (startBase === 1) r1 = null;
        else if (startBase === 2) r2 = null;
        else if (startBase === 3) r3 = null;
        if (outcome === 'safe') {
          const safeAtBase: number | undefined = payload?.safeAtBase;
          const state: RunnerState = { id: runnerId ?? prev?.id ?? 'unknown', reachedOnError: prev?.reachedOnError ?? false };
          if (safeAtBase === 1) r1 = state;
          else if (safeAtBase === 2) r2 = state;
          else if (safeAtBase === 3) r3 = state;
        } else if (outcome === 'out') {
          outsThisInning += 1;
        }
      }
    }
  }

  // ── Compute derived rates for all pitchers ─────────────────────────────
  for (const s of statsMap.values()) {
    const ip = inningsPitched(s.inningsPitchedOuts);

    s.strikePercentage = s.totalPitches > 0 ? s.strikes / s.totalPitches : 0;
    s.firstPitchStrikePercentage = s.totalPAs > 0 ? s.firstPitchStrikes / s.totalPAs : 0;
    s.threeBallCountPercentage = s.totalPAs > 0 ? s.threeBallCountPAs / s.totalPAs : 0;
    s.threeZeroCountPercentage = s.totalPAs > 0 ? s.threeZeroCountPAs / s.totalPAs : 0;

    if (ip > 0) {
      s.era = (s.earnedRunsAllowed * 7) / ip;
      s.whip = (s.walksAllowed + s.hitsAllowed) / ip;
      s.strikeoutsPerSeven = (s.strikeouts * 7) / ip;
      s.walksPerSeven = (s.walksAllowed * 7) / ip;
    } else {
      s.era = Infinity;
      s.whip = Infinity;
      s.strikeoutsPerSeven = 0;
      s.walksPerSeven = 0;
    }

    // Finalize BA by count averages
    for (const cs of Object.values(s.baByCount)) {
      cs.average = cs.atBats > 0 ? cs.hits / cs.atBats : NaN;
    }
  }

  return statsMap;
}
