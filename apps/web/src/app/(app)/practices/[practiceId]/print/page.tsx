import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import {
  buildCoachCardRows,
  computeBlockSchedule,
  PracticeBlockStatus,
} from '@baseball/shared';
import {
  getDrillsByIds,
  getPracticeWithBlocks,
} from '@baseball/database';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { PrintCoachCard } from './PrintCoachCard';

export const metadata: Metadata = { title: 'Practice card' };

interface Props {
  params: Promise<{ practiceId: string }>;
}

export default async function PrintPracticePage({ params }: Props): Promise<JSX.Element> {
  const { practiceId } = await params;
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');

  const supabase = createPracticeServiceClient();
  const practice = await getPracticeWithBlocks(supabase, practiceId);
  if (!practice) notFound();

  const { isCoach } = await getUserAccess(practice.teamId, user.id);
  if (!isCoach) redirect(`/practices/${practiceId}`);

  const drillIds = Array.from(
    new Set(
      practice.blocks
        .flatMap((b) => [b.drillId, ...b.stations.map((s) => s.drillId)])
        .filter((id): id is string => Boolean(id)),
    ),
  );
  // Single batched fetch — the previous per-id loop was O(N) round-trips.
  const drills = await getDrillsByIds(supabase, drillIds);
  const drillMap = new Map(drills.map((d) => [d.id, d]));

  const playerIds = Array.from(
    new Set(
      practice.blocks.flatMap((b) => [
        ...b.players.map((p) => p.playerId),
        ...b.stations.flatMap((s) => s.assignments.map((a) => a.playerId)),
      ]),
    ),
  );
  const playerMap = new Map<string, { id: string; firstName?: string; lastName?: string; jerseyNumber?: number }>();
  if (playerIds.length > 0) {
    const { data: playerRows } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number')
      .in('id', playerIds);
    for (const row of (playerRows ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      jersey_number: number | null;
    }>) {
      playerMap.set(row.id, {
        id: row.id,
        firstName: row.first_name ?? undefined,
        lastName: row.last_name ?? undefined,
        jerseyNumber: row.jersey_number ?? undefined,
      });
    }
  }

  // Fallback to "now" if the practice somehow has neither — the card still
  // needs to render with sensible relative times.
  const scheduleStart =
    practice.startedAt ?? practice.scheduledAt ?? new Date().toISOString();
  const schedule = computeBlockSchedule(
    practice.blocks.map((b) => ({
      id: b.id,
      position: b.position,
      plannedDurationMinutes: b.plannedDurationMinutes,
      status: b.status ?? PracticeBlockStatus.PENDING,
      actualDurationMinutes: b.actualDurationMinutes,
      startedAt: b.startedAt,
      completedAt: b.completedAt,
    })),
    scheduleStart,
  );
  const scheduleMap = new Map(
    schedule.map((s) => [s.blockId, { startsAt: s.startsAt, endsAt: s.endsAt }]),
  );

  const rows = buildCoachCardRows(
    practice,
    drillMap,
    playerMap,
    new Map(),
    scheduleMap,
  );

  return (
    <PrintCoachCard
      practiceDate={practice.scheduledAt}
      weatherMode={practice.weatherMode}
      totalMinutes={practice.totalPlannedMinutes}
      rows={rows}
    />
  );
}
