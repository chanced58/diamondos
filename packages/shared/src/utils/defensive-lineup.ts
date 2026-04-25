import { EventType, SubstitutionType } from '../types/game-event';

export type PositionAbbr =
  | 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF' | 'DH';

export const POSITION_ABBRS: PositionAbbr[] = [
  'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH',
];

export type Fielder = {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | string | null;
};

export type DefensiveLineup = Record<PositionAbbr, Fielder | null>;

export type DefensiveLineupEntry = {
  playerId: string;
  startingPosition: string | null;
  player: {
    firstName: string;
    lastName: string;
    jerseyNumber: number | string | null;
  };
};

export type DefensiveLineupRoster = {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | string | null;
};

export type DefensiveLineupEvent = {
  event_type: string;
  payload: Record<string, unknown> | null | undefined;
};

const POS_ALIASES: Record<string, PositionAbbr> = {
  P: 'P', PITCHER: 'P',
  C: 'C', CATCHER: 'C',
  '1B': '1B', FIRST_BASE: '1B',
  '2B': '2B', SECOND_BASE: '2B',
  '3B': '3B', THIRD_BASE: '3B',
  SS: 'SS', SHORTSTOP: 'SS',
  LF: 'LF', LEFT_FIELD: 'LF',
  CF: 'CF', CENTER_FIELD: 'CF',
  RF: 'RF', RIGHT_FIELD: 'RF',
  DH: 'DH', DESIGNATED_HITTER: 'DH',
};

function normalizePosition(raw: string | null | undefined): PositionAbbr | null {
  if (!raw) return null;
  const key = raw.trim().toUpperCase().replace(/\s+/g, '_');
  return POS_ALIASES[key] ?? null;
}

function emptyLineup(): DefensiveLineup {
  return {
    P: null, C: null, '1B': null, '2B': null, '3B': null,
    SS: null, LF: null, CF: null, RF: null, DH: null,
  };
}

function fielderFromLineup(entry: DefensiveLineupEntry): Fielder {
  return {
    playerId: entry.playerId,
    firstName: entry.player.firstName,
    lastName: entry.player.lastName,
    jerseyNumber: entry.player.jerseyNumber,
  };
}

function fielderFromRoster(
  playerId: string,
  roster: DefensiveLineupRoster[] | undefined,
  fallback?: Fielder | null,
): Fielder {
  const r = (roster ?? []).find((x) => x.id === playerId);
  if (r) {
    return {
      playerId,
      firstName: r.firstName,
      lastName: r.lastName,
      jerseyNumber: r.jerseyNumber,
    };
  }
  if (fallback && fallback.playerId === playerId) return fallback;
  return {
    playerId,
    firstName: 'Sub',
    lastName: 'Player',
    jerseyNumber: null,
  };
}

function findSlot(lineup: DefensiveLineup, playerId: string): PositionAbbr | null {
  for (const pos of POSITION_ABBRS) {
    if (lineup[pos]?.playerId === playerId) return pos;
  }
  return null;
}

/**
 * Derive the current defensive alignment for one team by replaying events
 * against the starting lineup. Returns a position→player map covering the
 * nine fielding positions plus DH. Slots are null when no player is known
 * (lineup not filled in, opponent roster unknown, etc.).
 *
 * Event handling mirrors `computeFieldingStats` but produces a snapshot
 * rather than aggregate stats:
 *   - PITCHING_CHANGE: replaces P with newPitcherId.
 *   - SUBSTITUTION position_change: moves outPlayerId to newPosition,
 *     clearing the destination first.
 *   - SUBSTITUTION defensive + newPosition: inPlayerId takes newPosition,
 *     outPlayerId is removed from any slot they hold.
 *   - SUBSTITUTION defensive without newPosition: inPlayerId replaces
 *     outPlayerId in whatever slot the latter occupies.
 */
export function deriveDefensiveLineup(
  baseLineup: DefensiveLineupEntry[],
  roster: DefensiveLineupRoster[] | undefined,
  events: DefensiveLineupEvent[],
  forOpponent: boolean,
): DefensiveLineup {
  const lineup = emptyLineup();

  for (const entry of baseLineup) {
    const pos = normalizePosition(entry.startingPosition);
    if (!pos) continue;
    lineup[pos] = fielderFromLineup(entry);
  }

  for (const event of events) {
    const etype = event.event_type;
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    if (etype === EventType.PITCHING_CHANGE) {
      const isOpp = Boolean(payload.isOpponentChange);
      if (isOpp !== forOpponent) continue;
      const newId = payload.newPitcherId as string | undefined;
      if (!newId) continue;
      lineup.P = fielderFromRoster(newId, roster, lineup.P);
      continue;
    }

    if (etype === EventType.SUBSTITUTION) {
      const isOpp = Boolean(payload.isOpponentSubstitution);
      if (isOpp !== forOpponent) continue;

      const subType = payload.substitutionType as string | undefined;
      const inId = payload.inPlayerId as string | undefined;
      const outId = payload.outPlayerId as string | undefined;
      const newPos = normalizePosition(payload.newPosition as string | undefined);

      if (subType === SubstitutionType.POSITION_CHANGE) {
        if (!outId || !newPos) continue;
        const fromSlot = findSlot(lineup, outId);
        const player = fromSlot ? lineup[fromSlot] : fielderFromRoster(outId, roster);
        if (fromSlot) lineup[fromSlot] = null;
        lineup[newPos] = player;
        continue;
      }

      if (subType === SubstitutionType.DEFENSIVE) {
        if (!inId) continue;
        const incoming = fielderFromRoster(inId, roster);
        if (newPos) {
          if (outId) {
            const fromSlot = findSlot(lineup, outId);
            if (fromSlot) lineup[fromSlot] = null;
          }
          lineup[newPos] = incoming;
        } else if (outId) {
          const fromSlot = findSlot(lineup, outId);
          if (fromSlot) lineup[fromSlot] = incoming;
        }
        continue;
      }

      // pinch_hitter / pinch_runner don't change the defensive alignment.
      // They're tracked separately via batting order / baserunner state.
      continue;
    }
  }

  return lineup;
}
