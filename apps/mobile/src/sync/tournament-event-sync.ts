export interface TournamentSyncEvent {
  id: string;
  game_id: string;
  sequence_number: number;
  event_type: string;
  inning: number;
  is_top_of_inning: boolean;
  payload: Record<string, unknown>;
  occurred_at: string;
  created_by: string;
  device_id: string;
}

export interface TournamentSyncRejection {
  gameId: string;
  eventId: string;
  eventType: string;
  sequenceNumber: number;
  code: string;
  reason: string;
}

interface TournamentEventSyncDeps {
  prepare: (gameId: string) => Promise<void>;
  start: (event: TournamentSyncEvent) => Promise<void>;
  send: (event: TournamentSyncEvent) => Promise<void>;
  cancel: (change: TournamentSyncEvent, voidEvent: TournamentSyncEvent) => Promise<void>;
}

export function reconcilePendingSequences(events: readonly { id: string; sequenceNumber: number }[], accepted: ReadonlyMap<string, number>, serverMax: number) {
  let nextSequence = serverMax + 1;
  return [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber).map((event) => ({
    id: event.id, sequenceNumber: accepted.get(event.id) ?? nextSequence++,
  }));
}

export async function pushTournamentEventQueue(events: readonly TournamentSyncEvent[], deps: TournamentEventSyncDeps): Promise<{
  rejections: TournamentSyncRejection[];
  retryGameIds: string[];
}> {
  const rejections: TournamentSyncRejection[] = [];
  const retryGameIds: string[] = [];
  const byGame = new Map<string, TournamentSyncEvent[]>();
  for (const event of events) {
    const group = byGame.get(event.game_id) ?? [];
    group.push(event);
    byGame.set(event.game_id, group);
  }
  for (const [gameId, group] of byGame) {
    group.sort((a, b) => a.sequence_number - b.sequence_number);
    const cancellations = new Map(group
      .filter((event) => event.event_type === 'event_voided' && event.payload.cancelledBeforeSync === true)
      .map((event) => [String(event.payload.voidedEventId), event]));
    const handled = new Set<string>();
    let current = group[0];
    try {
      await deps.prepare(gameId);
      for (const event of group) {
        current = event;
        if (handled.has(event.id)) continue;
        const cancellation = cancellations.get(event.id);
        if (cancellation && event.event_type === 'substitution') {
          await deps.cancel(event, cancellation);
          handled.add(cancellation.id);
        } else if (event.event_type === 'game_start') {
          await deps.start(event);
        } else {
          await deps.send(event);
        }
      }
    } catch (error) {
      const failure = error as { code?: string; message?: string } | null;
      if (failure?.code === '40001' || failure?.code === '23505') {
        retryGameIds.push(gameId);
      } else if (failure?.code && ['23514', '42501', '22023'].includes(failure.code)) {
        rejections.push({ gameId, eventId: current.id, eventType: current.event_type,
          sequenceNumber: current.sequence_number, code: failure.code,
          reason: failure.message ?? 'This tournament change could not be accepted.' });
      } else {
        throw error;
      }
    }
  }
  return { rejections, retryGameIds };
}
