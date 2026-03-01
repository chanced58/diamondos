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

    for (const event of gameEvents) {
      const etype: string = (event as any).event_type ?? event.eventType;
      const payload = event.payload as any;

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

        if (rbis) s.rbi += rbis;

        if (isHardHit(hitType, trajectory, sprayY)) s.hardHitBalls += 1;

        switch (hitType) {
          case HitType.DOUBLE:    s.doubles += 1;   break;
          case HitType.TRIPLE:    s.triples += 1;   break;
          case HitType.HOME_RUN:  s.homeRuns += 1;  break;
          // SINGLE and all contact hit types (ground_ball, fly_ball, line_drive, pop_up)
          // that result in a HIT event are singles
          default: break;  // single — no special sub-counter
        }
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
          // Regular batted-ball out (groundout, flyout, lineout, popout, other)
          s.atBats += 1;
          s.battedBalls += 1;
          if (isHardHit(undefined, trajectory, payload?.sprayY as number | undefined)) s.hardHitBalls += 1;
        }
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
      }

      // ── WALK ───────────────────────────────────────────────────────────────
      if (etype === EventType.WALK) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.walks += 1;
        // Not an at-bat
      }

      // ── HIT_BY_PITCH ───────────────────────────────────────────────────────
      if (etype === EventType.HIT_BY_PITCH) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.hitByPitch += 1;
        // Not an at-bat
      }

      // ── SACRIFICE_FLY ──────────────────────────────────────────────────────
      if (etype === EventType.SACRIFICE_FLY) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.sacrificeFlies += 1;
        s.battedBalls += 1;  // SF is a batted ball (fly ball by definition, but not typically "hard hit")
        if (payload?.rbis) s.rbi += payload.rbis as number;
        // Not an at-bat
      }

      // ── SACRIFICE_BUNT ────────────────────────────────────────────────────
      if (etype === EventType.SACRIFICE_BUNT) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.sacrificeHits += 1;
        s.battedBalls += 1;  // bunt is a batted ball (ground ball by definition, never hard hit)
        // Not an at-bat
      }

      // ── FIELD_ERROR ────────────────────────────────────────────────────────
      // Batter reached on error — counts as AB but not a hit
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
      }

      // ── DOUBLE_PLAY ────────────────────────────────────────────────────────
      // Batter hit into double play — counts as AB, out
      if (etype === EventType.DOUBLE_PLAY) {
        const batterId: string | undefined = payload?.batterId;
        if (!batterId) continue;
        markAppeared(batterId);
        const s = getStats(batterId);
        s.plateAppearances += 1;
        s.atBats += 1;
      }

      // ── SCORE ──────────────────────────────────────────────────────────────
      // A run scored — attribute to the scoring player
      if (etype === EventType.SCORE) {
        const scoringPlayerId: string | undefined = payload?.scoringPlayerId;
        if (!scoringPlayerId) continue;
        // Don't mark as appeared just from scoring — they appeared when they batted
        if (statsMap.has(scoringPlayerId)) {
          getStats(scoringPlayerId).runs += 1;
        }
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
