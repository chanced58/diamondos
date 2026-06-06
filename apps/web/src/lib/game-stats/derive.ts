/**
 * Pure game-stats derivation helpers shared by the stats page and the
 * Home Team export route. No React, no Supabase — only event replay over a
 * lineup. Extracted from the stats page so both consumers compute identically.
 */

export const DB_TO_POSITION: Record<string, string> = {
  pitcher: 'P', catcher: 'C', first_base: '1B', second_base: '2B',
  third_base: '3B', shortstop: 'SS', left_field: 'LF', center_field: 'CF',
  right_field: 'RF', designated_hitter: 'DH', infield: 'IF', outfield: 'OF',
  utility: 'UTIL',
};

// Position abbreviation → standard defensive position number
export const ABBR_TO_NUM: Record<string, number> = {
  P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9,
};

// Reverse map: position number → abbreviation. Used to label placeholder
// fielding-stat rows when no real player is assigned to a position.
const POSITION_NAME_BY_NUM: Record<number, string> = {
  1: 'P', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS', 7: 'LF', 8: 'CF', 9: 'RF',
};

// Synthetic id prefix used when a defensive position has no assigned player.
// Keeps fielding chances (errors, PO, A) from vanishing silently — they
// surface as "Position 3B" etc. in the table. NEVER persisted to the DB.
export const POSITION_PLACEHOLDER_PREFIX = '__POS__';

export type FieldingStatRow = {
  playerId: string;
  playerName: string;
  position: string;
  putouts: number;
  assists: number;
  errors: number;
};

export type LineupEntry = {
  playerId: string;
  battingOrder: number;
  startingPosition: string | null;
  player: { id: string | null; firstName: string; lastName: string; jerseyNumber: number | null };
};

export function computeFieldingStats(
  events: Record<string, unknown>[],
  teamLineup: LineupEntry[],
  isHome: boolean,
  playerNameMap: Map<string, { name: string; position: string }>,
  forOpponent = false,
): FieldingStatRow[] {
  // Position number → playerId for this team's defensive lineup
  const posToPlayer = new Map<number, string>();

  for (const entry of teamLineup) {
    if (entry.startingPosition) {
      const num = ABBR_TO_NUM[entry.startingPosition];
      if (num) posToPlayer.set(num, entry.playerId);
    }
  }

  const stats = new Map<string, FieldingStatRow>();

  function getRow(playerId: string): FieldingStatRow {
    if (!stats.has(playerId)) {
      // Synthetic placeholder ids like "__POS__5" don't have entries in the
      // player name map — label them by position so the table renders
      // "Position 3B" instead of "Unknown".
      if (playerId.startsWith(POSITION_PLACEHOLDER_PREFIX)) {
        const posNum = Number(playerId.slice(POSITION_PLACEHOLDER_PREFIX.length));
        const abbr = POSITION_NAME_BY_NUM[posNum] ?? String(posNum);
        stats.set(playerId, {
          playerId,
          playerName: `Position ${abbr}`,
          position: abbr,
          putouts: 0, assists: 0, errors: 0,
        });
      } else {
        const info = playerNameMap.get(playerId);
        stats.set(playerId, {
          playerId,
          playerName: info?.name ?? 'Unknown',
          position: info?.position ?? '',
          putouts: 0, assists: 0, errors: 0,
        });
      }
    }
    return stats.get(playerId)!;
  }

  // Resolve the credit target for `posNum`. Returns the real player id when
  // a player occupies the position, a synthetic placeholder id for non-pitcher
  // positions (2–9) when no player is set, or null when no credit should be
  // issued (pitcher with no player; or an out-of-range position from a
  // malformed scorer event).
  function resolveCreditId(posNum: number): string | null {
    const playerId = posToPlayer.get(posNum);
    if (playerId) return playerId;
    if (posNum < 2 || posNum > 9) return null;
    return `${POSITION_PLACEHOLDER_PREFIX}${posNum}`;
  }

  let isTopOfInning = true;

  for (const event of events) {
    const etype = event.event_type as string;
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    if (etype === 'inning_change') {
      isTopOfInning = !isTopOfInning;
      continue;
    }

    if (etype === 'pitching_change') {
      const isOppChange = payload.isOpponentChange as boolean | undefined;
      // Track this team's pitching changes: our team = !isOppChange, opponent = isOppChange
      if (forOpponent ? !!isOppChange : !isOppChange) {
        const newId = payload.newPitcherId as string | undefined;
        if (newId) posToPlayer.set(1, newId);
      }
      continue;
    }

    if (etype === 'substitution') {
      const isOppSub = payload.isOpponentSubstitution as boolean | undefined;
      if (forOpponent ? !!isOppSub : !isOppSub) {
        const inId = payload.inPlayerId as string | undefined;
        const outId = payload.outPlayerId as string | undefined;
        const newPos = payload.newPosition as string | undefined;
        if (inId && newPos && ABBR_TO_NUM[newPos]) {
          posToPlayer.set(ABBR_TO_NUM[newPos], inId);
        } else if (inId && outId) {
          for (const [num, pid] of posToPlayer.entries()) {
            if (pid === outId) { posToPlayer.set(num, inId); break; }
          }
        }
      }
      continue;
    }

    // Home team fields in top half; away team fields in bottom half.
    const teamIsFielding = forOpponent
      ? (isHome ? !isTopOfInning : isTopOfInning)
      : (isHome ? isTopOfInning : !isTopOfInning);
    if (!teamIsFielding) continue;

    if (
      etype === 'out' || etype === 'double_play' || etype === 'triple_play' ||
      etype === 'sacrifice_fly' || etype === 'sacrifice_bunt'
    ) {
      const seq = payload.fieldingSequence as number[] | undefined;
      if (seq && seq.length > 0) {
        for (let i = 0; i < seq.length; i++) {
          const id = resolveCreditId(seq[i]);
          if (!id) continue;
          if (i === seq.length - 1) getRow(id).putouts++;
          else getRow(id).assists++;
        }
      }
    }

    if (etype === 'field_error') {
      const errorBy = payload.errorBy as number | undefined;
      if (errorBy !== undefined) {
        const id = resolveCreditId(errorBy);
        if (id) getRow(id).errors++;
      }
    }

    if (etype === 'caught_stealing') {
      // Catcher typically gets the putout; add one if catcher is identified
      const id = resolveCreditId(2);
      if (id) getRow(id).putouts++;
    }

    if (etype === 'strikeout') {
      // Catcher gets PO on strikeout (if no SB/passed ball during the strikeout)
      const id = resolveCreditId(2);
      if (id) getRow(id).putouts++;
    }
  }

  return Array.from(stats.values());
}

export function computeBaserunningStats(
  events: Record<string, unknown>[],
  ourPlayerIds: Set<string>,
): Record<string, { sb: number; cs: number }> {
  const result: Record<string, { sb: number; cs: number }> = {};
  for (const event of events) {
    const etype = event.event_type as string;
    if (etype !== 'stolen_base' && etype !== 'caught_stealing') continue;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const runnerId = payload.runnerId as string | undefined;
    if (!runnerId || !ourPlayerIds.has(runnerId)) continue;
    if (!result[runnerId]) result[runnerId] = { sb: 0, cs: 0 };
    if (etype === 'stolen_base') result[runnerId].sb++;
    else result[runnerId].cs++;
  }
  return result;
}
