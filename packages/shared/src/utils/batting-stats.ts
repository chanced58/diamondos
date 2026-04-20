import { EventType, HitType, HitTrajectory, type GameEvent, type HitPayload, type OutPayload } from '../types/game-event';
import type { BattingStats } from '../types/batting';

/**
 * A batted ball is a "Hard Hit Ball" when:
 *   - Hit type is home_run (ball cleared the fence), OR
 *   - Trajectory is line_drive (hard straight contact), OR
 *   - Trajectory is fly_ball AND sprayY > 0.733 (deep outfield; 0.733 = 110/150 radius boundary)
 */
const DEEP_OF_SPRAY_Y_THRESHOLD = 0.733;

function isHardHit(hitType: string | undefined, trajectory: string | undefined, sprayY: number | undefined): boolean {
  if (hitType === HitType.HOME_RUN) return true;
  if (trajectory === HitTrajectory.LINE_DRIVE) return true;
  if (trajectory === HitTrajectory.FLY_BALL && typeof sprayY === 'number' && sprayY > DEEP_OF_SPRAY_Y_THRESHOLD) return true;
  return false;
}

// FanGraphs 2023 wOBA linear weights
const W_BB  = 0.69;
const W_HBP = 0.72;
const W_1B  = 0.89;
const W_2B  = 1.27;
const W_3B  = 1.62;
const W_HR  = 2.10;

function makeEmptyStats(playerId: string, playerName: string): BattingStats {
  return {
    playerId,
    playerName,
    gamesAppeared: 0,
    plateAppearances: 0,
    atBats: 0,
    runs: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    rbi: 0,
    walks: 0,
    strikeouts: 0,
    hitByPitch: 0,
    sacrificeFlies: 0,
    sacrificeHits: 0,
    avg: NaN,
    obp: NaN,
    slg: NaN,
    ops: NaN,
    iso: NaN,
    babip: NaN,
    kPct: NaN,
    bbPct: NaN,
    woba: NaN,
    battedBalls: 0,
    hardHitBalls: 0,
    hardHitPct: NaN,
  };
}

/** Format a rate stat (0–1) as ".XXX" or "---" when NaN/Infinity. */
export function formatBattingRate(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '---';
  return value.toFixed(3).replace(/^0/, '');
}

/** Format a percentage (0–1) as "XX.X%" or "---" when NaN/Infinity. */
export function formatBattingPct(value: number): string {
  if (!isFinite(value) || isNaN(value)) return '---';
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Derive season batting statistics for all batters from an ordered list of
 * game events. Events must be sorted by (game_id, sequence_number) ascending.
 *
 * @param events  All game events for the season (filtered to relevant types).
 * @param players Name lookup for player IDs.
 * @returns A map from playerId → BattingStats.
 */
export function deriveBattingStats(
  events: GameEvent[],
  players: { id: string; firstName: string; lastName: string }[],
): Map<string, BattingStats> {
  const nameMap = new Map<string, string>(
    players.map((p) => [p.id, `${p.firstName} ${p.lastName}`]),
  );

  const statsMap = new Map<string, BattingStats>();

  function getStats(playerId: string): BattingStats {
    if (!statsMap.has(playerId)) {
      const name = nameMap.get(playerId) ?? 'Unknown';
      statsMap.set(playerId, makeEmptyStats(playerId, name));
    }
    return statsMap.get(playerId)!;
  }

  // Group events by game_id preserving sequence order
  const gameMap = new Map<string, GameEvent[]>();
  for (const event of events) {
    const gameId = (event as any).game_id ?? event.gameId;
    if (!gameMap.has(gameId)) gameMap.set(gameId, []);
    gameMap.get(gameId)!.push(event);
  }

  for (const gameEvents of gameMap.values()) {
    gameEvents.sort((a, b) => {
      const aSeq = (a as any).sequence_number ?? a.sequenceNumber;
      const bSeq = (b as any).sequence_number ?? b.sequenceNumber;
      return aSeq - bSeq;
    });

    const appearedThisGame = new Set<string>();

    function markAppeared(playerId: string) {
      if (!appearedThisGame.has(playerId)) {
        appearedThisGame.add(playerId);
        getStats(playerId).gamesAppeared += 1;
      }
    }

    // ── Base-runner tracking (player IDs) for run attribution ──────────────
    let r1: string | null = null; // runner on 1st
    let r2: string | null = null; // runner on 2nd
    let r3: string | null = null; // runner on 3rd

    function clearBases() { r1 = null; r2 = null; r3 = null; }

    function scoreRunner(runnerId: string | null) {
      if (runnerId) {
        getStats(runnerId).runs += 1;
      }
    }

    /** Force-advance all runners (walk / HBP / error reach). Batter goes to 1st. */
    function forceAdvance(batterId: string) {
      if (r1 && r2 && r3) scoreRunner(r3); // bases loaded → runner on 3rd scores
      if (r1 && r2) r3 = r2;
      else if (!r3 && r2) { /* r2 stays */ }
      if (r1) r2 = r1;
      r1 = batterId;
    }

    for (const event of gameEvents) {
      const etype: string = (event as any).event_type ?? event.eventType;
      const payload = event.payload as any;

      // ── INNING_CHANGE ──────────────────────────────────────────────────────
      if (etype === 'inning_change') {
        clearBases();
        continue;
      }

      // ── HIT ────────────────────────────────────────────────────────────────
      if (etype === EventType.HIT) {
        const p = payload as HitPayload;
        const { batterId, hitType, trajectory, rbis, sprayY } = p;
        if (!batterId) continue;

        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.atBats += 1;
        s.hits += 1;
        s.battedBalls += 1;

        if (isHardHit(hitType, trajectory, sprayY)) s.hardHitBalls += 1;

        switch (hitType) {
          case HitType.DOUBLE:    s.doubles += 1;   break;
          case HitType.TRIPLE:    s.triples += 1;   break;
          case HitType.HOME_RUN:  s.homeRuns += 1;  break;
          default: break;  // single
        }

        // ── Advance runners, attribute runs, and auto-derive RBI (OBR 9.04) ──
        const bases = hitType === 'home_run' ? 4
          : hitType === 'triple' ? 3
          : hitType === 'double' ? 2
          : 1;

        let runsScored = 0;
        if (bases === 4) {
          // Home run: all runners + batter score
          if (r3) runsScored += 1;
          if (r2) runsScored += 1;
          if (r1) runsScored += 1;
          runsScored += 1;
          scoreRunner(r3); scoreRunner(r2); scoreRunner(r1);
          scoreRunner(batterId);
          clearBases();
        } else {
          // Determine which runners score
          if (r3) { scoreRunner(r3); runsScored += 1; }                      // 3rd always scores
          if (r2 && 2 + bases >= 4) { scoreRunner(r2); runsScored += 1; }    // scores on double+
          if (r1 && 1 + bases >= 4) { scoreRunner(r1); runsScored += 1; }    // scores on triple

          // Advance non-scoring runners
          if (bases === 1) {
            r3 = r2 ?? null; // r2 advances to 3rd; r3 already scored so clear it
            r2 = r1;       // r1 advances to 2nd
            r1 = batterId;
          } else if (bases === 2) {
            r3 = r1 ?? null; // r1 advances to 3rd
            r2 = batterId;
            r1 = null;
          } else if (bases === 3) {
            r3 = batterId;
            r2 = null;
            r1 = null;
          }
        }

        // Explicit payload.rbis (including 0) overrides derivation — scorer
        // may use this for OBR 9.04(b)(3) judgment calls where a run scored
        // but only because of a fielding error.
        s.rbi += rbis !== undefined ? rbis : runsScored;
        continue;
      }

      // ── OUT ────────────────────────────────────────────────────────────────
      if (etype === EventType.OUT) {
        const p = payload as OutPayload;
        const { batterId, outType, trajectory } = p;
        if (!batterId) continue;

        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;

        if (outType === 'strikeout') {
          s.strikeouts += 1;
          s.atBats += 1;
        } else {
          s.atBats += 1;
          s.battedBalls += 1;
          if (isHardHit(undefined, trajectory, payload?.sprayY as number | undefined)) s.hardHitBalls += 1;
        }
        continue;
      }

      // ── STRIKEOUT (explicit event) ─────────────────────────────────────────
      if (etype === EventType.STRIKEOUT) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.atBats += 1;
        s.strikeouts += 1;
        continue;
      }

      // ── DROPPED_THIRD_STRIKE ──────────────────────────────────────────────
      if (etype === EventType.DROPPED_THIRD_STRIKE) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.atBats += 1;
        s.strikeouts += 1;
        if (payload?.outcome !== 'thrown_out') {
          forceAdvance(batterId);
        }
        continue;
      }

      // ── WALK ───────────────────────────────────────────────────────────────
      if (etype === EventType.WALK) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.walks += 1;
        // Per OBR 9.04(a)(2): a base on balls with the bases loaded forces
        // the runner on third home and credits the batter with 1 RBI.
        const forcedRun = !!(r1 && r2 && r3);
        forceAdvance(batterId);
        const explicitRbis = payload?.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (forcedRun ? 1 : 0);
        continue;
      }

      // ── HIT_BY_PITCH ───────────────────────────────────────────────────────
      if (etype === EventType.HIT_BY_PITCH) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.hitByPitch += 1;
        // Per OBR 9.04(a)(2): HBP with the bases loaded forces in a run.
        const forcedRun = !!(r1 && r2 && r3);
        forceAdvance(batterId);
        const explicitRbis = payload?.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (forcedRun ? 1 : 0);
        continue;
      }

      // ── SACRIFICE_FLY ──────────────────────────────────────────────────────
      if (etype === EventType.SACRIFICE_FLY) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.sacrificeFlies += 1;
        s.battedBalls += 1;
        // Per OBR 9.04(a)(1): a sacrifice fly that scores the runner from
        // third credits the batter with 1 RBI.
        const runScored = !!r3;
        if (r3) { scoreRunner(r3); r3 = null; }
        const explicitRbis = payload?.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (runScored ? 1 : 0);
        continue;
      }

      // ── SACRIFICE_BUNT ────────────────────────────────────────────────────
      if (etype === EventType.SACRIFICE_BUNT) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.sacrificeHits += 1;
        s.battedBalls += 1;
        continue;
      }

      // ── FIELD_ERROR ────────────────────────────────────────────────────────
      if (etype === EventType.FIELD_ERROR) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.atBats += 1;
        s.battedBalls += 1;
        const traj = payload?.trajectory as string | undefined;
        const sy = payload?.sprayY as number | undefined;
        if (isHardHit(undefined, traj, sy)) s.hardHitBalls += 1;
        forceAdvance(batterId);
        continue;
      }

      // ── DOUBLE_PLAY ────────────────────────────────────────────────────────
      if (etype === EventType.DOUBLE_PLAY) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.atBats += 1;
        continue;
      }

      // ── SCORE (explicit — stolen home, balk, runner advance) ──────────────
      if (etype === EventType.SCORE) {
        const scoringPlayerId: string | undefined = payload?.scoringPlayerId;
        if (!scoringPlayerId) continue;
        scoreRunner(scoringPlayerId);
        // Remove from bases
        if (r3 === scoringPlayerId) r3 = null;
        else if (r2 === scoringPlayerId) r2 = null;
        else if (r1 === scoringPlayerId) r1 = null;
        continue;
      }

      // ── STOLEN_BASE ────────────────────────────────────────────────────────
      if (etype === 'stolen_base') {
        const runnerId: string | undefined = payload?.runnerId;
        const toBase: number | undefined = payload?.toBase;
        if (!runnerId || !toBase) continue;
        // Remove from current base
        if (r1 === runnerId) r1 = null;
        else if (r2 === runnerId) r2 = null;
        else if (r3 === runnerId) r3 = null;
        // Place on new base (toBase 4 = scored; run credited by SCORE event)
        if (toBase === 3) r3 = runnerId;
        else if (toBase === 2) r2 = runnerId;
        continue;
      }

      // ── CAUGHT_STEALING ────────────────────────────────────────────────────
      if (etype === 'caught_stealing') {
        const runnerId: string | undefined = payload?.runnerId;
        if (r1 === runnerId) r1 = null;
        else if (r2 === runnerId) r2 = null;
        else if (r3 === runnerId) r3 = null;
        continue;
      }

      // ── BASERUNNER_ADVANCE ─────────────────────────────────────────────────
      if (etype === 'baserunner_advance') {
        const runnerId: string | undefined = payload?.runnerId;
        const toBase: number | undefined = payload?.toBase;
        if (!runnerId || !toBase) continue;
        if (r1 === runnerId) r1 = null;
        else if (r2 === runnerId) r2 = null;
        else if (r3 === runnerId) r3 = null;
        // toBase 4 = scored; run credited by SCORE event
        if (toBase === 3) r3 = runnerId;
        else if (toBase === 2) r2 = runnerId;
        else if (toBase === 1) r1 = runnerId;
        continue;
      }

      // ── SUBSTITUTION ───────────────────────────────────────────────────────
      if (etype === 'substitution') {
        const inId: string | undefined = payload?.inPlayerId;
        const outId: string | undefined = payload?.outPlayerId;
        if (inId && outId) {
          // If the substituted player is on base, replace them
          if (r1 === outId) r1 = inId;
          if (r2 === outId) r2 = inId;
          if (r3 === outId) r3 = inId;
        }
        continue;
      }
    }
  }

  // ── Compute derived rates ─────────────────────────────────────────────────
  for (const s of statsMap.values()) {
    const singles = s.hits - s.doubles - s.triples - s.homeRuns;
    const totalBases = singles + 2 * s.doubles + 3 * s.triples + 4 * s.homeRuns;

    s.avg   = s.atBats > 0 ? s.hits / s.atBats : NaN;
    s.slg   = s.atBats > 0 ? totalBases / s.atBats : NaN;

    const obpDenom = s.atBats + s.walks + s.hitByPitch + s.sacrificeFlies;
    s.obp   = obpDenom > 0 ? (s.hits + s.walks + s.hitByPitch) / obpDenom : NaN;

    s.ops   = (isNaN(s.obp) || isNaN(s.slg)) ? NaN : s.obp + s.slg;
    s.iso   = (isNaN(s.slg) || isNaN(s.avg)) ? NaN : s.slg - s.avg;

    const babipDenom = s.atBats - s.strikeouts - s.homeRuns + s.sacrificeFlies;
    s.babip = babipDenom > 0 ? (s.hits - s.homeRuns) / babipDenom : NaN;

    s.kPct  = s.plateAppearances > 0 ? s.strikeouts / s.plateAppearances : NaN;
    s.bbPct = s.plateAppearances > 0 ? s.walks / s.plateAppearances : NaN;

    const wobaDenom = s.atBats + s.walks + s.sacrificeFlies + s.hitByPitch;
    s.woba  = wobaDenom > 0
      ? (W_BB * s.walks + W_HBP * s.hitByPitch + W_1B * singles +
         W_2B * s.doubles + W_3B * s.triples + W_HR * s.homeRuns) / wobaDenom
      : NaN;

    s.hardHitPct = s.battedBalls > 0 ? s.hardHitBalls / s.battedBalls : NaN;
  }

  return statsMap;
}
