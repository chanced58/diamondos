/**
 * Compute opponent batting statistics from game events.
 *
 * Resolves the opponent batter from each event by checking both
 * `opponentBatterId` (canonical) and `batterId` (the ScoringBoard stores
 * all batter IDs under `batterId` regardless of team). A batter ID is
 * considered an opponent if it exists in the provided `oppPlayerNameMap`.
 *
 * Works for both single-game and multi-game (season) aggregation — just
 * pass all relevant events in sequence-number order.
 */

export type OppBattingRow = {
  playerId: string;
  playerName: string;
  pa: number; ab: number; r: number; h: number;
  doubles: number; triples: number; hr: number;
  rbi: number; bb: number; k: number;
  hbp: number; sf: number; sh: number;
  sb: number; cs: number;
  avg: number; obp: number; slg: number; ops: number;
};

export function computeOpponentBatting(
  events: Record<string, unknown>[],
  oppPlayerNameMap: Map<string, string>,
): OppBattingRow[] {
  const stats = new Map<string, OppBattingRow>();

  function get(id: string): OppBattingRow {
    if (!stats.has(id)) {
      stats.set(id, {
        playerId: id,
        playerName: oppPlayerNameMap.get(id) ?? 'Unknown',
        pa: 0, ab: 0, r: 0, h: 0,
        doubles: 0, triples: 0, hr: 0,
        rbi: 0, bb: 0, k: 0,
        hbp: 0, sf: 0, sh: 0,
        sb: 0, cs: 0,
        avg: NaN, obp: NaN, slg: NaN, ops: NaN,
      });
    }
    return stats.get(id)!;
  }

  // Group events by game_id to prevent base-runner state bleeding across games
  const gameMap = new Map<string, Record<string, unknown>[]>();
  for (const event of events) {
    const gameId = event.game_id as string;
    if (!gameMap.has(gameId)) gameMap.set(gameId, []);
    gameMap.get(gameId)!.push(event);
  }

  for (const gameEvents of gameMap.values()) {
    gameEvents.sort((a, b) => {
      const aSeq = a.sequence_number as number;
      const bSeq = b.sequence_number as number;
      return aSeq - bSeq;
    });

    // ── Base-runner tracking (opponent player IDs) — reset per game ────────
    let r1: string | null = null;
    let r2: string | null = null;
    let r3: string | null = null;

    function clearBases() { r1 = null; r2 = null; r3 = null; }

    function scoreRunner(runnerId: string | null) {
      if (runnerId && oppPlayerNameMap.has(runnerId)) {
        get(runnerId).r++;
      }
    }

    function forceAdvance(batterId: string) {
      if (r1 && r2 && r3) scoreRunner(r3);
      if (r1 && r2) r3 = r2;
      if (r1) r2 = r1;
      r1 = batterId;
    }

    for (const event of gameEvents) {
      const etype = event.event_type as string;
      const payload = (event.payload ?? {}) as Record<string, unknown>;

      if (etype === 'inning_change') {
        clearBases();
        continue;
      }

      // Resolve opponent batter: check opponentBatterId first, then batterId if in map
      const batterId =
        (payload.opponentBatterId as string | undefined) ??
        (oppPlayerNameMap.has(payload.batterId as string) ? (payload.batterId as string) : undefined);

      // Handle events without an opponent batter
      if (!batterId) {
        if (etype === 'score') {
          const scoringId = payload.scoringPlayerId as string | undefined;
          if (scoringId && oppPlayerNameMap.has(scoringId)) {
            scoreRunner(scoringId);
            if (r3 === scoringId) r3 = null;
            else if (r2 === scoringId) r2 = null;
            else if (r1 === scoringId) r1 = null;
          }
        }
        if (etype === 'stolen_base') {
          const runnerId = payload.runnerId as string | undefined;
          const toBase = payload.toBase as number | undefined;
          if (runnerId && oppPlayerNameMap.has(runnerId)) {
            get(runnerId).sb++;
            if (r1 === runnerId) r1 = null;
            else if (r2 === runnerId) r2 = null;
            else if (r3 === runnerId) r3 = null;
            // toBase 4 = scored; run credited by SCORE event
            if (toBase === 3) r3 = runnerId;
            else if (toBase === 2) r2 = runnerId;
          }
        }
        if (etype === 'caught_stealing') {
          const runnerId = payload.runnerId as string | undefined;
          if (runnerId && oppPlayerNameMap.has(runnerId)) {
            get(runnerId).cs++;
            if (r1 === runnerId) r1 = null;
            else if (r2 === runnerId) r2 = null;
            else if (r3 === runnerId) r3 = null;
          }
        }
        if (etype === 'baserunner_advance') {
          const runnerId = payload.runnerId as string | undefined;
          const toBase = payload.toBase as number | undefined;
          if (runnerId && oppPlayerNameMap.has(runnerId) && toBase) {
            if (r1 === runnerId) r1 = null;
            else if (r2 === runnerId) r2 = null;
            else if (r3 === runnerId) r3 = null;
            // toBase 4 = scored; run credited by SCORE event
            if (toBase === 3) r3 = runnerId;
            else if (toBase === 2) r2 = runnerId;
            else if (toBase === 1) r1 = runnerId;
          }
        }
        if (etype === 'substitution') {
          const inId = payload.inPlayerId as string | undefined;
          const outId = payload.outPlayerId as string | undefined;
          if (inId && outId) {
            if (r1 === outId) r1 = inId;
            if (r2 === outId) r2 = inId;
            if (r3 === outId) r3 = inId;
          }
        }
        if (etype === 'balk') {
          // Per OBR 6.02(a): all runners advance one base on a balk.
          // r3 scores via the paired SCORE event; opponent-stats' SCORE
          // handler credits the run regardless of whether r3 is still
          // in base state when it processes.
          r3 = r2;
          r2 = r1;
          r1 = null;
        }
        continue;
      }

      if (etype === 'hit') {
        const s = get(batterId);
        const fieldersChoice = payload.fieldersChoice === true;
        const hitType = payload.hitType as string;
        s.pa++; s.ab++;
        if (!fieldersChoice) {
          s.h++;
          if (hitType === 'double') s.doubles++;
          else if (hitType === 'triple') s.triples++;
          else if (hitType === 'home_run') s.hr++;
        }

        const bases = hitType === 'home_run' ? 4
          : hitType === 'triple' ? 3
          : hitType === 'double' ? 2
          : 1;

        // Count runs scored on this hit for auto-derived RBI (OBR 9.04).
        let runsScored = 0;
        if (bases === 4) {
          if (r3) runsScored++;
          if (r2) runsScored++;
          if (r1) runsScored++;
          runsScored++;
          scoreRunner(r3); scoreRunner(r2); scoreRunner(r1);
          scoreRunner(batterId);
          clearBases();
        } else {
          if (r3) { scoreRunner(r3); runsScored++; }
          if (r2 && 2 + bases >= 4) { scoreRunner(r2); runsScored++; }
          if (r1 && 1 + bases >= 4) { scoreRunner(r1); runsScored++; }
          if (bases === 1) {
            r3 = r2 ?? null; r2 = r1; r1 = batterId;
          } else if (bases === 2) {
            r3 = r1 ?? null; r2 = batterId; r1 = null;
          } else if (bases === 3) {
            r3 = batterId; r2 = null; r1 = null;
          }
        }
        const explicitRbis = payload.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : runsScored;
      } else if (etype === 'out' || etype === 'double_play' || etype === 'triple_play') {
        const s = get(batterId);
        s.pa++; s.ab++;
        // Some scorers emit strikeouts as OUT with outType='strikeout'
        // rather than EventType.STRIKEOUT; count the k here to match
        // batting-stats.ts behavior.
        if (etype === 'out' && payload.outType === 'strikeout') {
          s.k++;
        }
        if (etype === 'double_play') {
          const runnerOutBase = payload.runnerOutBase as 1 | 2 | 3 | undefined;
          if (runnerOutBase === 1) r1 = null;
          else if (runnerOutBase === 2) r2 = null;
          else if (runnerOutBase === 3) r3 = null;
        }
      } else if (etype === 'strikeout') {
        const s = get(batterId);
        s.pa++; s.ab++; s.k++;
      } else if (etype === 'walk') {
        const s = get(batterId);
        s.pa++; s.bb++;
        // OBR 9.04(a)(2): bases-loaded walk forces in a run for 1 RBI.
        const forcedRun = !!(r1 && r2 && r3);
        forceAdvance(batterId);
        const explicitRbis = payload.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (forcedRun ? 1 : 0);
      } else if (etype === 'catcher_interference') {
        const s = get(batterId);
        s.pa++;
        // OBR 9.02(a)(4): CI is not an at-bat.
        // OBR 9.04(a)(2): bases-loaded CI forces in a run for 1 RBI.
        const forcedRun = !!(r1 && r2 && r3);
        forceAdvance(batterId);
        const explicitRbis = payload.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (forcedRun ? 1 : 0);
      } else if (etype === 'hit_by_pitch') {
        const s = get(batterId);
        s.pa++; s.hbp++;
        // OBR 9.04(a)(2): bases-loaded HBP forces in a run for 1 RBI.
        const forcedRun = !!(r1 && r2 && r3);
        forceAdvance(batterId);
        const explicitRbis = payload.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (forcedRun ? 1 : 0);
      } else if (etype === 'sacrifice_fly') {
        const s = get(batterId);
        s.pa++; s.sf++;
        // OBR 9.04(a)(1): sacrifice fly scoring a runner credits 1 RBI.
        const runScored = !!r3;
        if (r3) { scoreRunner(r3); r3 = null; }
        const explicitRbis = payload.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (runScored ? 1 : 0);
      } else if (etype === 'sacrifice_bunt') {
        // OBR 9.08(a): advances runners one base; squeeze scores r3 for 1 RBI.
        const s = get(batterId);
        s.pa++; s.sh++;
        const runScored = !!r3;
        if (r3) scoreRunner(r3);
        r3 = r2 ?? null;
        r2 = r1;
        r1 = null;
        const explicitRbis = payload.rbis as number | undefined;
        s.rbi += explicitRbis !== undefined ? explicitRbis : (runScored ? 1 : 0);
      } else if (etype === 'dropped_third_strike') {
        const s = get(batterId);
        s.pa++; s.ab++; s.k++;
        if (payload.outcome !== 'thrown_out') {
          forceAdvance(batterId);
        }
      } else if (etype === 'field_error') {
        const s = get(batterId);
        s.pa++; s.ab++;
        forceAdvance(batterId);
      }
    }
  }

  for (const s of stats.values()) {
    s.avg = s.ab > 0 ? s.h / s.ab : NaN;
    const obpDenom = s.ab + s.bb + s.hbp + s.sf;
    s.obp = obpDenom > 0 ? (s.h + s.bb + s.hbp) / obpDenom : NaN;
    const singles = s.h - s.doubles - s.triples - s.hr;
    const tb = singles + 2 * s.doubles + 3 * s.triples + 4 * s.hr;
    s.slg = s.ab > 0 ? tb / s.ab : NaN;
    s.ops = (isFinite(s.obp) ? s.obp : 0) + (isFinite(s.slg) ? s.slg : 0);
    if (!isFinite(s.obp) && !isFinite(s.slg)) s.ops = NaN;
  }

  return Array.from(stats.values());
}
