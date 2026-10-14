import { pushTournamentEventQueue, reconcilePendingSequences, type TournamentSyncEvent } from '../tournament-event-sync';

function event(id: string, game = 'one', type = 'substitution', sequence = 2): TournamentSyncEvent {
  return { id, game_id: game, sequence_number: sequence, event_type: type, inning: 1, is_top_of_inning: false,
    payload: type === 'substitution' ? { substitutionType: 'lineup_extension', inPlayerId: 'late', battingOrderPosition: 10 } : {},
    occurred_at: '2026-10-20T12:00:00Z', created_by: 'coach', device_id: 'device' };
}

function deps() {
  const accepted: string[] = [];
  const order: string[] = [];
  return {
    accepted, order,
    prepare: async (id: string) => { order.push(`lineup:${id}`); },
    start: async (row: TournamentSyncEvent) => { order.push(row.id); accepted.push(row.id); },
    send: async (row: TournamentSyncEvent) => { order.push(row.id); if (!accepted.includes(row.id)) accepted.push(row.id); },
    cancel: async (change: TournamentSyncEvent, voidEvent: TournamentSyncEvent) => { accepted.push(change.id, voidEvent.id); },
  };
}

it('keeps already accepted event positions while moving unsynced events after a concurrent write', () => {
  expect(reconcilePendingSequences([
    { id: 'start', sequenceNumber: 1 }, { id: 'change', sequenceNumber: 2 }, { id: 'play', sequenceNumber: 3 },
  ], new Map([['start', 1]]), 2)).toEqual([
    { id: 'start', sequenceNumber: 1 }, { id: 'change', sequenceNumber: 3 }, { id: 'play', sequenceNumber: 4 },
  ]);
});

it('repairs a gap before the first offline start instead of retrying the same invalid sequence forever', () => {
  expect(reconcilePendingSequences([{ id: 'start', sequenceNumber: 20 }, { id: 'change', sequenceNumber: 21 }], new Map(), 0)).toEqual([
    { id: 'start', sequenceNumber: 1 }, { id: 'change', sequenceNumber: 2 },
  ]);
});

it('uploads starting lineups before an offline start and subsequent changes', async () => {
  const io = deps();
  await pushTournamentEventQueue([event('change'), event('start', 'one', 'game_start', 1)], io);
  expect(io.order).toEqual(['lineup:one', 'start', 'change']);
});

it('holds a rejected game for correction while another game reaches the server', async () => {
  const io = deps();
  io.send = async (row) => { if (row.id === 'bad') throw { code: '23514', message: 'Tournament cap reached' }; io.accepted.push(row.id); };
  const bad = event('bad');
  const original = JSON.stringify(bad);
  const result = await pushTournamentEventQueue([bad, event('later', 'one', 'out', 3), event('healthy', 'two', 'out')], io);
  expect(io.accepted).toEqual(['healthy']);
  expect(result.rejections).toEqual([expect.objectContaining({ gameId: 'one', eventId: 'bad', reason: 'Tournament cap reached', code: '23514' })]);
  expect(JSON.stringify(bad)).toBe(original);
});

it('retains a rejected start and its reason without blocking another game', async () => {
  const io = deps();
  io.start = async () => { throw { code: '42501', message: 'Coaching permission required' }; };
  const result = await pushTournamentEventQueue([event('start', 'one', 'game_start'), event('healthy', 'two', 'out')], io);
  expect(result.rejections[0]).toMatchObject({ eventId: 'start', eventType: 'game_start', code: '42501' });
  expect(io.accepted).toEqual(['healthy']);
});

it('sends an explicitly cancelled rejection and its void atomically while retaining both facts', async () => {
  const io = deps();
  const change = event('bad');
  const cancellation = event('cancel', 'one', 'event_voided', 3);
  cancellation.payload = { voidedEventId: 'bad', cancelledBeforeSync: true };
  const result = await pushTournamentEventQueue([change, cancellation, event('later', 'one', 'out', 4)], io);
  expect(result.rejections).toEqual([]);
  expect(io.accepted).toEqual(['bad', 'cancel', 'later']);
  expect(io.order).toEqual(['lineup:one', 'later']);
});

it('leaves transient connection errors retryable instead of labelling them rejected', async () => {
  const io = deps();
  io.send = async () => { throw new Error('network down'); };
  await expect(pushTournamentEventQueue([event('change')], io)).rejects.toThrow('network down');
});

it('returns a sequence collision for reconciliation rather than permanent rejection', async () => {
  const io = deps();
  io.send = async () => { throw { code: '40001', message: 'sequence collision' }; };
  const result = await pushTournamentEventQueue([event('change')], io);
  expect(result.rejections).toEqual([]);
  expect(result.retryGameIds).toEqual(['one']);
});

it('retries a partially uploaded queue idempotently after permissions are corrected', async () => {
  const io = deps();
  const rows = [event('first', 'one', 'out', 1), event('change')];
  const send = io.send;
  io.send = async (row) => { if (row.id === 'change') throw { code: '42501', message: 'permission revoked' }; await send(row); };
  await pushTournamentEventQueue(rows, io);
  io.send = send;
  const result = await pushTournamentEventQueue(rows, io);
  expect(result.rejections).toEqual([]);
  expect(io.accepted).toEqual(['first', 'change']);
});
