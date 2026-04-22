/**
 * Pure stats helpers for the MaxPreps export. Shared between the TXT (legacy)
 * and XML (Tier 5) output paths so both see identical aggregates.
 *
 * Mirror of packages/shared/src/utils/event-filters.ts + batting-stats.ts
 * logic, inlined because Deno edge functions can't import from
 * @baseball/shared at runtime. Keep in sync when that logic changes.
 */

export interface PlayerStats {
  ab: number;
  r: number;
  h: number;
  doubles: number;
  triples: number;
  hr: number;
  rbi: number;
  bb: number;
  so: number;
}

export type RawEvent = {
  id?: string;
  sequence_number?: number;
  event_type: string;
  payload: Record<string, unknown>;
  inning?: number;
  is_top_of_inning: boolean;
};

/**
 * Removes events targeted by EVENT_VOIDED and trims the tail back to
 * revertToSequenceNumber on PITCH_REVERTED.
 */
export function applyCorrections(events: RawEvent[]): RawEvent[] {
  const result: RawEvent[] = [];
  for (const event of events) {
    const etype = event.event_type;
    if (etype === 'pitch_reverted') {
      const keepUntilSeq = (event.payload?.revertToSequenceNumber as number | undefined) ?? 0;
      while (
        result.length > 0 &&
        (result[result.length - 1].sequence_number ?? 0) > keepUntilSeq
      ) {
        result.pop();
      }
    } else if (etype === 'event_voided') {
      const voidedId = event.payload?.voidedEventId as string | undefined;
      if (!voidedId) continue;
      const idx = result.findIndex((e) => e.id === voidedId);
      if (idx !== -1) result.splice(idx, 1);
    } else {
      result.push(event);
    }
  }
  return result;
}

export function aggregateStats(events: RawEvent[]): Map<string, PlayerStats> {
  const stats = new Map<string, PlayerStats>();

  let r1: string | null = null;
  let r2: string | null = null;
  let r3: string | null = null;

  function get(id: string): PlayerStats {
    if (!stats.has(id)) {
      stats.set(id, { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 0 });
    }
    return stats.get(id)!;
  }
  function scoreRunner(id: string | null) { if (id) get(id).r++; }
  function clearBases() { r1 = null; r2 = null; r3 = null; }
  function forceAdvance(batterId: string) {
    if (r1 && r2 && r3) scoreRunner(r3);
    if (r1 && r2) r3 = r2;
    if (r1) r2 = r1;
    r1 = batterId;
  }
  function creditRbi(batterStats: PlayerStats, payload: Record<string, unknown>, autoDerived: number) {
    const explicit = payload.rbis as number | undefined;
    batterStats.rbi += explicit !== undefined ? explicit : autoDerived;
  }

  for (const event of events) {
    const p = event.payload;
    const etype = event.event_type;

    if (etype === 'inning_change') { clearBases(); continue; }

    const batterId = p.batterId as string | undefined;

    if (etype === 'hit') {
      if (!batterId) continue;
      const s = get(batterId);
      const hitType = p.hitType as string;
      const fieldersChoice = p.fieldersChoice === true;
      s.ab++;
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
      let runsScored = 0;
      if (bases === 4) {
        if (r3) runsScored++;
        if (r2) runsScored++;
        if (r1) runsScored++;
        runsScored++;
        scoreRunner(r3); scoreRunner(r2); scoreRunner(r1); scoreRunner(batterId);
        clearBases();
      } else {
        if (r3) { scoreRunner(r3); runsScored++; }
        if (r2 && 2 + bases >= 4) { scoreRunner(r2); runsScored++; }
        if (r1 && 1 + bases >= 4) { scoreRunner(r1); runsScored++; }
        if (bases === 1) { r3 = r2 ?? null; r2 = r1; r1 = batterId; }
        else if (bases === 2) { r3 = r1 ?? null; r2 = batterId; r1 = null; }
        else if (bases === 3) { r3 = batterId; r2 = null; r1 = null; }
      }
      creditRbi(s, p, runsScored);
      continue;
    }

    if (etype === 'out') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++;
      if (p.outType === 'strikeout') s.so++;
      creditRbi(s, p, 0);
      continue;
    }

    if (etype === 'strikeout') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++; s.so++;
      continue;
    }

    if (etype === 'double_play' || etype === 'triple_play') {
      if (!batterId) continue;
      get(batterId).ab++;
      if (etype === 'double_play') {
        const runnerOutBase = p.runnerOutBase as number | undefined;
        if (runnerOutBase === 1) r1 = null;
        else if (runnerOutBase === 2) r2 = null;
        else if (runnerOutBase === 3) r3 = null;
      }
      continue;
    }

    if (etype === 'walk') {
      if (!batterId) continue;
      const s = get(batterId);
      s.bb++;
      const forcedRun = !!(r1 && r2 && r3);
      forceAdvance(batterId);
      creditRbi(s, p, forcedRun ? 1 : 0);
      continue;
    }

    if (etype === 'hit_by_pitch' || etype === 'catcher_interference') {
      if (!batterId) continue;
      const s = get(batterId);
      const forcedRun = !!(r1 && r2 && r3);
      forceAdvance(batterId);
      creditRbi(s, p, forcedRun ? 1 : 0);
      continue;
    }

    if (etype === 'sacrifice_fly') {
      if (!batterId) continue;
      const s = get(batterId);
      const runScored = !!r3;
      if (r3) { scoreRunner(r3); r3 = null; }
      creditRbi(s, p, runScored ? 1 : 0);
      continue;
    }

    if (etype === 'sacrifice_bunt') {
      if (!batterId) continue;
      const s = get(batterId);
      const runScored = !!r3;
      if (r3) scoreRunner(r3);
      r3 = r2 ?? null;
      r2 = r1;
      r1 = null;
      creditRbi(s, p, runScored ? 1 : 0);
      continue;
    }

    if (etype === 'field_error') {
      if (!batterId) continue;
      get(batterId).ab++;
      forceAdvance(batterId);
      continue;
    }

    if (etype === 'dropped_third_strike') {
      if (!batterId) continue;
      const s = get(batterId);
      s.ab++; s.so++;
      if (p.outcome !== 'thrown_out') forceAdvance(batterId);
      continue;
    }

    if (etype === 'stolen_base') {
      const runnerId = p.runnerId as string | undefined;
      const toBase = p.toBase as number | undefined;
      if (!runnerId || !toBase) continue;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      if (toBase === 3) r3 = runnerId;
      else if (toBase === 2) r2 = runnerId;
      continue;
    }

    if (etype === 'caught_stealing' || etype === 'baserunner_out') {
      const runnerId = p.runnerId as string | undefined;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      continue;
    }

    if (etype === 'baserunner_advance') {
      const runnerId = p.runnerId as string | undefined;
      const toBase = p.toBase as number | undefined;
      if (!runnerId || !toBase) continue;
      if (r1 === runnerId) r1 = null;
      else if (r2 === runnerId) r2 = null;
      else if (r3 === runnerId) r3 = null;
      if (toBase === 3) r3 = runnerId;
      else if (toBase === 2) r2 = runnerId;
      else if (toBase === 1) r1 = runnerId;
      continue;
    }

    if (etype === 'score') {
      const scoringPlayerId = p.scoringPlayerId as string | undefined;
      if (!scoringPlayerId) continue;
      scoreRunner(scoringPlayerId);
      if (r3 === scoringPlayerId) r3 = null;
      else if (r2 === scoringPlayerId) r2 = null;
      else if (r1 === scoringPlayerId) r1 = null;
      continue;
    }
  }

  return stats;
}
