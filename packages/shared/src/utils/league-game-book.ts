/**
 * Translate one team's scorebook (game_events rows) into either team's point
 * of view, so the existing stat reducers can credit both teams' real players
 * from a single book of a shared league game.
 */

export interface SideIdMap {
  /** id appearing in the book → this side's real players.id */
  toOurPlayer: ReadonlyMap<string, string>;
  /** id appearing in the book → id to use for the other side */
  toOpponent: ReadonlyMap<string, string>;
}

/** Prefix for unmatched placeholders / fill-ins on their own side, so reducers still count them in team totals. */
export const PLACEHOLDER_PREFIX = 'placeholder:';

const KEY_PAIRS: readonly (readonly [ours: string, opponent: string])[] = [
  ['batterId', 'opponentBatterId'],
  ['pitcherId', 'opponentPitcherId'],
];

function mapString(value: string, map: SideIdMap): string {
  return map.toOurPlayer.get(value) ?? map.toOpponent.get(value) ?? value;
}

function mapDeep(value: unknown, map: SideIdMap): unknown {
  if (typeof value === 'string') return mapString(value, map);
  if (Array.isArray(value)) return value.map((item) => mapDeep(item, map));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = mapDeep(inner, map);
    }
    return out;
  }
  return value;
}

function normalizeKeyPair(
  payload: Record<string, unknown>,
  original: Record<string, unknown>,
  [ourKey, opponentKey]: readonly [string, string],
  map: SideIdMap,
): void {
  const originalId = original[ourKey] ?? original[opponentKey];
  if (typeof originalId !== 'string') return;
  const resolved = mapString(originalId, map);
  delete payload[ourKey];
  delete payload[opponentKey];
  payload[map.toOurPlayer.has(originalId) ? ourKey : opponentKey] = resolved;
}

function translateEvent(event: Record<string, unknown>, map: SideIdMap): Record<string, unknown> {
  const original = event.payload;
  if (original === null || typeof original !== 'object' || Array.isArray(original)) {
    return { ...event };
  }
  const payload = mapDeep(original, map) as Record<string, unknown>;
  for (const pair of KEY_PAIRS) {
    normalizeKeyPair(payload, original as Record<string, unknown>, pair, map);
  }
  return { ...event, payload };
}

/**
 * Returns copies of `events` with every id in each payload rewritten for the
 * side described by `map` (deep, including arrays such as `fieldingSequence`).
 * Batter/pitcher keys are then normalized: an id that `toOurPlayer` knows goes
 * under `batterId` / `pitcherId`, any other id under `opponentBatterId` /
 * `opponentPitcherId`. Only `payload` is rewritten; other row fields are kept.
 */
export function translateBookForSide(
  events: Record<string, unknown>[],
  map: SideIdMap,
): Record<string, unknown>[] {
  return events.map((event) => translateEvent(event, map));
}

/**
 * Builds the id maps for both teams' views of a book scored by one team.
 *
 * `scoringTeamPlayerIds` must include every player who appears in the
 * scoring team's lineup, guests included: an id found in neither map is left
 * unchanged and treated as an opponent.
 */
export function buildSideIdMaps(input: {
  scoringTeamPlayerIds: readonly string[];
  rosterRecordPlayers: readonly {
    id: string;
    linkedPlayerId: string | null;
    isPlaceholder: boolean;
    isFillIn: boolean;
  }[];
  /** the non-scoring team's roster record for the scoring team: linked opponent_player id per scoring-team player */
  reverseLinks: ReadonlyMap<string, string>;
}): { scoringSide: SideIdMap; otherSide: SideIdMap } {
  const { scoringTeamPlayerIds, rosterRecordPlayers, reverseLinks } = input;

  const scoringSide: SideIdMap = {
    toOurPlayer: new Map(scoringTeamPlayerIds.map((id) => [id, id])),
    toOpponent: new Map(rosterRecordPlayers.map((player) => [player.id, player.id])),
  };

  const otherToOur = new Map<string, string>();
  for (const player of rosterRecordPlayers) {
    otherToOur.set(
      player.id,
      player.linkedPlayerId ?? `${PLACEHOLDER_PREFIX}${player.id}`,
    );
  }
  const otherToOpponent = new Map<string, string>();
  for (const id of scoringTeamPlayerIds) {
    const linked = reverseLinks.get(id);
    if (linked !== undefined) otherToOpponent.set(id, linked);
  }

  return {
    scoringSide,
    otherSide: { toOurPlayer: otherToOur, toOpponent: otherToOpponent },
  };
}
