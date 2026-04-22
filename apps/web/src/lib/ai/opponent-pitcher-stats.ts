import type { ScoutingPitcherStats } from '@baseball/shared';

interface PitchEventPayload {
  pitcherId?: string;
  opponentPitcherId?: string;
  pitchType?: string;
  velocity?: number;
  outcome?: string;
  zoneLocation?: number;
}

interface RawGameEvent {
  event_type: string;
  payload: Record<string, unknown>;
}

interface RunningPitcher {
  opponentPlayerId: string | null;
  displayName: string;
  pitches: number;
  velocitySum: number;
  velocityCount: number;
  firstPitchCount: number;
  firstPitchStrikes: number;
  mix: Map<string, number>;
  // track whether previous event in this AB was also a pitch — to detect first-pitch.
}

const STRIKE_OUTCOMES = new Set(['called_strike', 'swinging_strike', 'foul', 'in_play']);

/**
 * Aggregate opponent pitcher tendencies from a stream of game_events.
 *
 * The scorer stores pitcher IDs under either `pitcherId` (when our team is
 * batting and the pitcher on the mound is the opponent's) or
 * `opponentPitcherId` (canonical opponent-facing field). We accept either —
 * only rows whose resolved pitcher id is in `oppPlayerById` are kept.
 *
 * "First-pitch strike" is approximated: we flag the first pitch in each new
 * plate appearance. Since we don't have clean PA boundaries in the event
 * stream without replay, we reset the PA when we see a non-pitch event
 * (hit/out/walk/etc.) or when the batter changes.
 */
export function computeOpponentPitcherStats(
  events: RawGameEvent[],
  oppPlayerById: Map<string, { displayName: string }>,
): ScoutingPitcherStats[] {
  const byPitcher = new Map<string, RunningPitcher>();

  let lastBatterId: string | null = null;
  let lastPitcherId: string | null = null;
  let inPa = false;

  for (const ev of events) {
    const payload = (ev.payload ?? {}) as PitchEventPayload & {
      batterId?: string;
      opponentBatterId?: string;
    };

    const pid = payload.opponentPitcherId ?? payload.pitcherId ?? null;
    const opp = pid ? oppPlayerById.get(pid) : null;

    if (ev.event_type === 'pitch_thrown' && pid && opp) {
      const running =
        byPitcher.get(pid) ??
        ({
          opponentPlayerId: pid,
          displayName: opp.displayName,
          pitches: 0,
          velocitySum: 0,
          velocityCount: 0,
          firstPitchCount: 0,
          firstPitchStrikes: 0,
          mix: new Map<string, number>(),
        } satisfies RunningPitcher);

      running.pitches += 1;
      if (typeof payload.velocity === 'number' && payload.velocity > 0) {
        running.velocitySum += payload.velocity;
        running.velocityCount += 1;
      }
      const type = payload.pitchType ?? 'unknown';
      running.mix.set(type, (running.mix.get(type) ?? 0) + 1);

      const batterId =
        (payload.batterId as string | undefined) ??
        (payload.opponentBatterId as string | undefined) ??
        null;
      const newPa =
        !inPa || batterId !== lastBatterId || pid !== lastPitcherId;
      if (newPa) {
        running.firstPitchCount += 1;
        if (payload.outcome && STRIKE_OUTCOMES.has(payload.outcome)) {
          running.firstPitchStrikes += 1;
        }
      }
      lastBatterId = batterId;
      lastPitcherId = pid;
      inPa = true;

      byPitcher.set(pid, running);
    } else {
      // Non-opponent-pitch events (our pitcher throwing, or non-pitch events
      // like hit/out/substitution) end the current opponent-pitch PA. The next
      // opponent pitch we see should be treated as a new PA's first pitch.
      inPa = false;
      lastBatterId = null;
      lastPitcherId = null;
    }
  }

  const result: ScoutingPitcherStats[] = [];
  for (const r of byPitcher.values()) {
    const mixEntries = Array.from(r.mix.entries());
    const total = r.pitches;
    const pitchMix = mixEntries
      .map(([pitchType, count]) => ({
        pitchType,
        count,
        percent: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    result.push({
      opponentPlayerId: r.opponentPlayerId,
      displayName: r.displayName,
      pitches: r.pitches,
      pitchMix,
      avgVelocity:
        r.velocityCount > 0 ? r.velocitySum / r.velocityCount : null,
      firstPitchStrikePct:
        r.firstPitchCount > 0 ? r.firstPitchStrikes / r.firstPitchCount : null,
    });
  }

  return result.sort((a, b) => b.pitches - a.pitches);
}
