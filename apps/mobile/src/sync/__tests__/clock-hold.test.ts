import { describeClockHold, pushEventsHoldingClockAhead } from '../clock-hold';

const SERVER_NOW = Date.parse('2026-11-11T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function event(id: string, offsetMs: number, game = 'g1') {
  return { id, game_id: game, occurred_at: new Date(SERVER_NOW + offsetMs).toISOString() };
}

function clockRefusal(details: string | undefined = String(SERVER_NOW)) {
  return { code: 'P0001', hint: 'device_clock_ahead', details, message: 'game_events.occurred_at (...) is more than 24h ahead of server now (...); check device clock' };
}

/** A fake server that refuses any batch holding an event > 24h ahead, as the trigger does. */
function fakeServer(details?: string) {
  const accepted: string[] = [];
  const calls: string[][] = [];
  const upsert = jest.fn(async (rows: Array<ReturnType<typeof event>>) => {
    calls.push(rows.map((row) => row.id));
    if (rows.some((row) => Date.parse(row.occurred_at) > SERVER_NOW + DAY)) return clockRefusal(details);
    accepted.push(...rows.map((row) => row.id));
    return null;
  });
  return { upsert, accepted, calls };
}

describe('pushEventsHoldingClockAhead', () => {
  it('should push everything in one call when the server accepts it', async () => {
    const server = fakeServer();
    const result = await pushEventsHoldingClockAhead([event('a', 0), event('b', 1000)], server.upsert);
    expect(result).toEqual({ held: [], error: null });
    expect(server.calls).toEqual([['a', 'b']]);
  });

  it('should hold only the future-dated events and push the rest in a second call', async () => {
    const server = fakeServer();
    const result = await pushEventsHoldingClockAhead(
      [event('ok-1', 0), event('fast', 3 * DAY, 'g2'), event('ok-2', DAY - 1000)],
      server.upsert,
    );
    expect(result).toEqual({ held: [{ gameId: 'g2', eventId: 'fast' }], error: null });
    expect(server.accepted).toEqual(['ok-1', 'ok-2']);
    expect(server.calls).toHaveLength(2);
  });

  it('should hold every event when the whole batch is future-dated, without dropping any', async () => {
    const server = fakeServer();
    const result = await pushEventsHoldingClockAhead([event('a', 2 * DAY), event('b', 2 * DAY + 1)], server.upsert);
    expect(result.held.map((held) => held.eventId)).toEqual(['a', 'b']);
    expect(result.error).toBeNull();
    expect(server.accepted).toEqual([]);
  });

  it('should find the refused events one at a time when the refusal carries no server clock', async () => {
    const server = fakeServer('not-a-number');
    const result = await pushEventsHoldingClockAhead([event('ok', 0), event('fast', 2 * DAY), event('ok-2', 0)], server.upsert);
    expect(result).toEqual({ held: [{ gameId: 'g1', eventId: 'fast' }], error: null });
    expect(server.accepted).toEqual(['ok', 'ok-2']);
  });

  it('should hand any other failure back to the caller untouched', async () => {
    const collision = { code: '23505', message: 'duplicate key value violates unique constraint' };
    const upsert = jest.fn(async () => collision);
    expect(await pushEventsHoldingClockAhead([event('a', 0)], upsert)).toEqual({ held: [], error: collision });
  });

  it('should report another failure that surfaces after the held events are set aside', async () => {
    const denied = { code: '42501', message: 'new row violates row-level security policy' };
    const upsert = jest.fn()
      .mockResolvedValueOnce(clockRefusal())
      .mockResolvedValueOnce(denied);
    const result = await pushEventsHoldingClockAhead([event('fast', 2 * DAY), event('ok', 0)], upsert);
    expect(result).toEqual({ held: [{ gameId: 'g1', eventId: 'fast' }], error: denied });
  });
});

describe('describeClockHold', () => {
  it('should say nothing when no plays are held', () => {
    expect(describeClockHold(0)).toBeNull();
  });

  it('should name the count and the fix', () => {
    const hold = describeClockHold(3)!;
    expect(hold.label).toContain('3 plays waiting');
    expect(hold.explanation).toContain('Set Automatically');
    expect(describeClockHold(1)!.label).toContain('1 play waiting');
  });
});
