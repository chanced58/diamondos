import { BLOCK_TYPE_LABELS } from '../constants/practice';
import { PracticeDrill } from '../types/practice-drill';
import {
  PracticeBlock,
  PracticeStation,
  PracticeStationAssignment,
  PracticeWithBlocks,
} from '../types/practice';

export interface CoachCardRow {
  blockId: string;
  ordinal: number;
  startsAt?: string;
  endsAt?: string;
  blockTypeLabel: string;
  title: string;
  plannedDurationMinutes: number;
  drillName?: string;
  fieldSpaces: string[];
  assignedCoachName?: string;
  players: Array<{ id: string; name: string; jerseyNumber?: number }>;
  stations: Array<{
    name: string;
    drillName?: string;
    fieldSpace?: string;
    playersPerRotation: Array<{ rotationIndex: number; playerNames: string[] }>;
  }>;
  notes?: string;
}

interface PlayerLike {
  id: string;
  firstName?: string;
  lastName?: string;
  jerseyNumber?: number;
}

interface CoachLike {
  id: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

type PracticeForPrint = Pick<PracticeWithBlocks, 'id'> & {
  blocks: Array<
    PracticeBlock & {
      players: Array<{ playerId: string }>;
      stations: Array<PracticeStation & { assignments: PracticeStationAssignment[] }>;
    }
  >;
};

function nameOf(p: PlayerLike): string {
  const first = p.firstName ?? '';
  const last = p.lastName ?? '';
  const joined = `${first} ${last}`.trim();
  return joined.length > 0 ? joined : p.id;
}

function coachName(c: CoachLike | undefined): string | undefined {
  if (!c) return undefined;
  if (c.displayName) return c.displayName;
  const joined = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
  return joined.length > 0 ? joined : undefined;
}

/**
 * Turns a fully-hydrated practice bundle into flat rows ready for the
 * printable coach card. Timestamps are supplied separately (by caller who
 * owns the scheduled times from computeBlockSchedule).
 */
export function buildCoachCardRows(
  practice: PracticeForPrint,
  drills: ReadonlyMap<string, PracticeDrill> | Record<string, PracticeDrill> = new Map(),
  players: ReadonlyMap<string, PlayerLike> | Record<string, PlayerLike> = new Map(),
  coaches: ReadonlyMap<string, CoachLike> | Record<string, CoachLike> = new Map(),
  schedule?: Map<string, { startsAt: string; endsAt: string }>,
): CoachCardRow[] {
  const drillLookup =
    drills instanceof Map ? drills : new Map(Object.entries(drills));
  const playerLookup =
    players instanceof Map ? players : new Map(Object.entries(players));
  const coachLookup =
    coaches instanceof Map ? coaches : new Map(Object.entries(coaches));

  const orderedBlocks = [...practice.blocks].sort((a, b) => a.position - b.position);

  return orderedBlocks.map((block, i) => {
    const slot = schedule?.get(block.id);
    const drill = block.drillId ? drillLookup.get(block.drillId) : undefined;
    const assignedCoach = block.assignedCoachId
      ? coachLookup.get(block.assignedCoachId)
      : undefined;

    const playerRows = block.players
      .map((bp) => {
        const p = playerLookup.get(bp.playerId);
        if (!p) return { id: bp.playerId, name: bp.playerId };
        return { id: p.id, name: nameOf(p), jerseyNumber: p.jerseyNumber };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const stations = [...block.stations]
      .sort((a, b) => a.position - b.position)
      .map((station) => {
        const byRotation = new Map<number, string[]>();
        for (const assign of station.assignments) {
          const p = playerLookup.get(assign.playerId);
          const bucket = byRotation.get(assign.rotationIndex) ?? [];
          bucket.push(p ? nameOf(p) : assign.playerId);
          byRotation.set(assign.rotationIndex, bucket);
        }
        const stationDrill = station.drillId ? drillLookup.get(station.drillId) : undefined;
        return {
          name: station.name,
          drillName: stationDrill?.name,
          fieldSpace: station.fieldSpace ?? undefined,
          playersPerRotation: [...byRotation.entries()]
            .sort(([a], [b]) => a - b)
            .map(([rotationIndex, playerNames]) => ({
              rotationIndex,
              playerNames: playerNames.sort((a, b) => a.localeCompare(b)),
            })),
        };
      });

    return {
      blockId: block.id,
      ordinal: i + 1,
      startsAt: slot?.startsAt,
      endsAt: slot?.endsAt,
      blockTypeLabel: BLOCK_TYPE_LABELS[block.blockType] ?? block.blockType,
      title: block.title,
      plannedDurationMinutes: block.plannedDurationMinutes,
      drillName: drill?.name,
      fieldSpaces: block.fieldSpaces,
      assignedCoachName: coachName(assignedCoach),
      players: playerRows,
      stations,
      notes: block.notes ?? undefined,
    };
  });
}
