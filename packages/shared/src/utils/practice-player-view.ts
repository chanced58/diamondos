import type { PracticeWithBlocks } from '../types/practice';
import { computeBlockSchedule } from './practice-schedule';

export interface PlayerRotationStep {
  blockId: string;
  blockTitle: string;
  blockType: string;
  startsAt: string;
  endsAt: string;
  stationId?: string;
  stationName?: string;
  stationNotes?: string | null;
  drillId?: string | null;
  rotationIndex?: number;
}

/**
 * Flattens a practice tree into the sequence of steps a specific player will
 * experience, with clock times. Non-station blocks the player is on yield one
 * step spanning the whole block; station blocks yield one step per rotation
 * the player is assigned to, each timed by `rotationIndex * rotationDurationMinutes`.
 */
export function buildPlayerRotationView(
  practice: PracticeWithBlocks,
  playerId: string,
): PlayerRotationStep[] {
  const clockBase = practice.startedAt ?? practice.scheduledAt;

  const scheduled = computeBlockSchedule(
    practice.blocks.map((b) => ({
      id: b.id,
      position: b.position,
      plannedDurationMinutes: b.plannedDurationMinutes,
      actualDurationMinutes: b.actualDurationMinutes,
      status: b.status,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
    })),
    clockBase,
  );
  const schedById = new Map(scheduled.map((s) => [s.blockId, s]));

  const steps: PlayerRotationStep[] = [];

  for (const block of [...practice.blocks].sort((a, b) => a.position - b.position)) {
    const sched = schedById.get(block.id);
    if (!sched) continue;

    const stationMatches = (block.stations ?? []).flatMap((st) =>
      (st.assignments ?? [])
        .filter((a) => a.playerId === playerId)
        .map((a) => ({ station: st, rotationIndex: a.rotationIndex })),
    );

    if (stationMatches.length > 0) {
      const blockStartMs = new Date(sched.startsAt).getTime();
      for (const { station, rotationIndex } of [...stationMatches].sort(
        (a, b) => a.rotationIndex - b.rotationIndex,
      )) {
        const startMs = blockStartMs + rotationIndex * station.rotationDurationMinutes * 60_000;
        const endMs = startMs + station.rotationDurationMinutes * 60_000;
        steps.push({
          blockId: block.id,
          blockTitle: block.title,
          blockType: block.blockType,
          startsAt: new Date(startMs).toISOString(),
          endsAt: new Date(endMs).toISOString(),
          stationId: station.id,
          stationName: station.name,
          stationNotes: station.notes ?? null,
          drillId: station.drillId ?? null,
          rotationIndex,
        });
      }
      continue;
    }

    const inBlockPlayers = (block.players ?? []).some((bp) => bp.playerId === playerId);
    if (inBlockPlayers) {
      steps.push({
        blockId: block.id,
        blockTitle: block.title,
        blockType: block.blockType,
        startsAt: sched.startsAt,
        endsAt: sched.endsAt,
      });
    }
  }

  return steps;
}
