import { PracticeStationAssignment } from '../types/practice';

export interface RotationStationInput {
  id: string;
  position: number;
  rotationCount: number;
}

/**
 * Round-robin rotation plan: players are split into `stations.length` groups,
 * each group starts at a different station, and rotates forward one station
 * per rotation_index.
 *
 * Invariants enforced here (and asserted by `validateRotation`):
 *   - No player appears twice in the same (rotationIndex) across stations.
 *   - Every player appears in exactly rotationCount rotations.
 *
 * If `stations[*].rotationCount` values differ, the minimum is used so every
 * station rotates the same number of times.
 */
export function buildStationRotation(
  playerIds: string[],
  stations: RotationStationInput[],
): Omit<PracticeStationAssignment, 'id' | 'createdAt'>[] {
  if (stations.length === 0 || playerIds.length === 0) return [];

  const orderedStations = [...stations].sort((a, b) => a.position - b.position);
  const rotations = Math.max(
    1,
    Math.min(...orderedStations.map((s) => s.rotationCount)),
  );

  // Split players into N groups in row-major order (1,2,3,4 into 3 stations
  // becomes [[1,4],[2],[3]]). Missing slots are OK — a station just sits
  // empty that rotation. Works for players<stations case.
  const groups: string[][] = Array.from({ length: orderedStations.length }, () => []);
  playerIds.forEach((pid, i) => {
    groups[i % orderedStations.length].push(pid);
  });

  const out: Omit<PracticeStationAssignment, 'id' | 'createdAt'>[] = [];

  for (let r = 0; r < rotations; r++) {
    for (let g = 0; g < groups.length; g++) {
      // group g at rotation r sits at station (g + r) mod stationCount.
      const stationIdx = (g + r) % orderedStations.length;
      const station = orderedStations[stationIdx];
      for (const playerId of groups[g]) {
        out.push({
          stationId: station.id,
          playerId,
          rotationIndex: r,
        });
      }
    }
  }

  return out;
}

export interface RotationValidation {
  ok: boolean;
  duplicates: Array<{
    playerId: string;
    rotationIndex: number;
    stationIds: string[];
  }>;
}

/**
 * Checks the cross-station invariant: no player at two stations in the same
 * rotationIndex. Used both by tests and as an in-app safety check before
 * persisting.
 */
export function validateRotation(
  assignments: Array<Pick<PracticeStationAssignment, 'stationId' | 'playerId' | 'rotationIndex'>>,
): RotationValidation {
  const seen = new Map<string, string[]>(); // key: `${playerId}:${rotation}` -> stationIds
  for (const a of assignments) {
    const key = `${a.playerId}:${a.rotationIndex}`;
    const bucket = seen.get(key) ?? [];
    bucket.push(a.stationId);
    seen.set(key, bucket);
  }

  const duplicates: RotationValidation['duplicates'] = [];
  for (const [key, stationIds] of seen) {
    if (stationIds.length > 1) {
      const [playerId, rotationStr] = key.split(':');
      duplicates.push({
        playerId,
        rotationIndex: Number(rotationStr),
        stationIds,
      });
    }
  }

  return { ok: duplicates.length === 0, duplicates };
}
