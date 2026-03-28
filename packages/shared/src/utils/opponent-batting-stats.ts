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

  for (const event of events) {
    const etype = event.event_type as string;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    // The ScoringBoard always writes `batterId` regardless of which team is
    // at bat, so also check `batterId` against the opponent name map.
    const batterId =
      (payload.opponentBatterId as string | undefined) ??
      (oppPlayerNameMap.has(payload.batterId as string) ? (payload.batterId as string) : undefined);

    if (!batterId) {
      if (etype === 'score') {
        const scoringId = payload.scoringPlayerId as string | undefined;
        const isOpp = payload.isOpponentScore as boolean | undefined;
        if (scoringId && isOpp && oppPlayerNameMap.has(scoringId)) {
          get(scoringId).r++;
        }
      }
      if (etype === 'stolen_base' || etype === 'caught_stealing') {
        const runnerId = payload.runnerId as string | undefined;
        if (runnerId && oppPlayerNameMap.has(runnerId)) {
          if (etype === 'stolen_base') get(runnerId).sb++;
          else get(runnerId).cs++;
        }
      }
      continue;
    }

    if (etype === 'hit') {
      const s = get(batterId);
      s.pa++; s.ab++; s.h++;
      s.rbi += (payload.rbis as number) ?? 0;
      const hitType = payload.hitType as string;
      if (hitType === 'double') s.doubles++;
      else if (hitType === 'triple') s.triples++;
      else if (hitType === 'home_run') s.hr++;
    } else if (etype === 'out' || etype === 'double_play' || etype === 'triple_play') {
      const s = get(batterId);
      s.pa++; s.ab++;
    } else if (etype === 'strikeout') {
      const s = get(batterId);
      s.pa++; s.ab++; s.k++;
    } else if (etype === 'walk') {
      const s = get(batterId);
      s.pa++; s.bb++;
    } else if (etype === 'hit_by_pitch') {
      const s = get(batterId);
      s.pa++; s.hbp++;
    } else if (etype === 'sacrifice_fly') {
      const s = get(batterId);
      s.pa++; s.sf++;
    } else if (etype === 'sacrifice_bunt') {
      const s = get(batterId);
      s.pa++; s.sh++;
    } else if (etype === 'field_error') {
      const s = get(batterId);
      s.pa++; s.ab++;
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
