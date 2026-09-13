import { EventType } from '@baseball/shared';
import {
  fetchGameEventsForGame,
  mapWdbGameEventToShared,
  type WdbGameEventRow,
  type GameEventsCollection,
} from '../fetch-game-events';
import { voidEvent } from '../void-event';

/**
 * Covers the risky, previously-untested production path Finding 1 named:
 * the WatermelonDB query + WDB→shared `GameEvent` field mapping that
 * score.tsx's `voidEvent` wrapper runs before handing events to the pure
 * `voidEvent` cascade in void-event.ts (which already has its own coverage
 * against hand-built shared-shaped fixtures). A fake `GameEventsCollection`
 * stands in for `database.get<GameEvent>('game_events')` — same
 * `.query(...).fetch()` surface, no real WatermelonDB needed.
 */

function mkRow(overrides: Partial<WdbGameEventRow> = {}): WdbGameEventRow {
  return {
    id: 'local-1',
    remoteId: 'remote-1',
    gameRemoteId: 'game-1',
    sequenceNumber: 1,
    eventType: EventType.HIT,
    inning: 3,
    isTopOfInning: true,
    payload: { batterId: 'alice' },
    occurredAt: Date.UTC(2026, 0, 1, 12, 0, 0),
    createdBy: 'user-1',
    deviceId: 'device-1',
    ...overrides,
  };
}

/** Fake `Collection<GameEvent>` — records the query clauses it was called
 * with and returns a canned set of rows on `.fetch()`, so tests can assert
 * on both "was the right game queried" and "did the mapping come out
 * right" without standing up WatermelonDB. */
function fakeCollection(rows: WdbGameEventRow[]): {
  collection: GameEventsCollection;
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  const collection: GameEventsCollection = {
    query(...clauses: unknown[]) {
      calls.push(clauses);
      return { fetch: async () => rows };
    },
  };
  return { collection, calls };
}

describe('mapWdbGameEventToShared', () => {
  it('maps every field voidEvent (void-event.ts) and deriveGameState read', () => {
    const row = mkRow();
    const mapped = mapWdbGameEventToShared(row);
    expect(mapped).toEqual({
      id: 'remote-1',
      gameId: 'game-1',
      sequenceNumber: 1,
      eventType: EventType.HIT,
      inning: 3,
      isTopOfInning: true,
      payload: { batterId: 'alice' },
      occurredAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)).toISOString(),
      createdBy: 'user-1',
      deviceId: 'device-1',
    });
  });

  it('falls back to the local WatermelonDB id when remoteId is empty (not yet synced)', () => {
    const row = mkRow({ remoteId: '', id: 'local-only-1' });
    const mapped = mapWdbGameEventToShared(row);
    expect(mapped.id).toBe('local-only-1');
  });
});

describe('fetchGameEventsForGame', () => {
  it('queries the collection and maps every returned row', async () => {
    const rows = [
      mkRow({ id: 'l1', remoteId: 'r1', sequenceNumber: 1, eventType: EventType.HIT }),
      mkRow({ id: 'l2', remoteId: 'r2', sequenceNumber: 2, eventType: EventType.OUT }),
    ];
    const { collection, calls } = fakeCollection(rows);

    const result = await fetchGameEventsForGame(collection, 'game-1');

    expect(result.map((e) => e.id)).toEqual(['r1', 'r2']);
    expect(result.map((e) => e.eventType)).toEqual([EventType.HIT, EventType.OUT]);
    // Queried exactly once, scoped by the given game id.
    expect(calls).toHaveLength(1);
  });

  it('returns an empty array for a game with no events, without throwing', async () => {
    const { collection } = fakeCollection([]);
    const result = await fetchGameEventsForGame(collection, 'game-empty');
    expect(result).toEqual([]);
  });

  it('is not bounded to a trailing window — a target many rows back survives the fetch', async () => {
    const rows = Array.from({ length: 100 }, (_, i) =>
      mkRow({ id: `l${i}`, remoteId: `r${i}`, sequenceNumber: i, eventType: EventType.PITCH_THROWN }),
    );
    rows[0] = mkRow({ id: 'l0', remoteId: 'r0', sequenceNumber: 0, eventType: EventType.HIT });
    const { collection } = fakeCollection(rows);

    const result = await fetchGameEventsForGame(collection, 'game-1');

    expect(result).toHaveLength(100);
    expect(result[0]).toMatchObject({ id: 'r0', eventType: EventType.HIT });
  });

  it('feeds voidEvent (the pure cascade) a stream it can actually void from — end-to-end pin', async () => {
    // Regression guard for the exact risk Finding 1 named: a wrong or
    // missing field in the mapping would mean voidEvent silently no-ops
    // (target "not found") or targets the wrong row, even though the pure
    // cascade itself is fully tested elsewhere.
    const rows = [
      mkRow({ id: 'l1', remoteId: 'evt-hit', sequenceNumber: 1, eventType: EventType.HIT }),
      mkRow({
        id: 'l2',
        remoteId: 'evt-runner-out',
        sequenceNumber: 2,
        eventType: EventType.BASERUNNER_OUT,
        payload: { relatedEventId: 'evt-hit', runnerId: 'bob' },
      }),
    ];
    const { collection } = fakeCollection(rows);
    const sharedEvents = await fetchGameEventsForGame(collection, 'game-1');

    const voided: string[] = [];
    await voidEvent('evt-hit', sharedEvents, {
      recordVoid: async (payload) => {
        voided.push(payload.voidedEventId);
        return 'voided-id';
      },
    });

    // Child (linked BASERUNNER_OUT) voided first, then the parent — proof
    // the mapped relatedEventId round-tripped correctly through the fetch.
    expect(voided).toEqual(['evt-runner-out', 'evt-hit']);
  });
});
