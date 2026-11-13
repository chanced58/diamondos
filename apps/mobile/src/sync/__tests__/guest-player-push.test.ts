import {
  guestRows,
  isDuplicateKey,
  pushGuestPlayers,
  toGuestPlayerWrite,
  type GuestLeagueRegistration,
  type GuestPlayerFields,
  type GuestPlayerWrite,
  type PushError,
} from '../guest-player-push';

const RLS_REFUSAL: PushError = {
  code: '42501',
  message: 'new row violates row-level security policy for table "players"',
};
const DUPLICATE: PushError = {
  code: '23505',
  message: 'duplicate key value violates unique constraint "players_pkey"',
};

function guest(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    remote_id: id, team_id: null, first_name: 'Sam', last_name: 'Late',
    jersey_number: 44, is_guest_only: true, is_active: true, ...extra,
  };
}

function registration(playerId: string, leagueId = 'league-1'): Record<string, unknown> {
  return { league_id: leagueId, player_remote_id: playerId };
}

type Result = { error: PushError | null };

/**
 * A fake server: plain inserts that refuse `refusedIds` under RLS and answer
 * a duplicate key for ids already in `existingIds`.
 */
function fakeServer(refusedIds: string[] = [], existingIds: string[] = []) {
  const insertedPlayers: string[] = [];
  const registered: string[] = [];
  const updates: Array<[string, GuestPlayerFields]> = [];
  const playerCalls: string[][] = [];
  return {
    insertedPlayers, registered, updates, playerCalls,
    writers: {
      insertPlayers: jest.fn(async (writes: GuestPlayerWrite[]): Promise<Result> => {
        playerCalls.push(writes.map((w) => w.id));
        if (writes.some((w) => refusedIds.includes(w.id))) return { error: RLS_REFUSAL };
        if (writes.some((w) => existingIds.includes(w.id))) return { error: DUPLICATE };
        insertedPlayers.push(...writes.map((w) => w.id));
        return { error: null };
      }),
      registerInLeague: jest.fn(async (writes: GuestLeagueRegistration[]): Promise<Result> => {
        registered.push(...writes.map((w) => w.player_id));
        return { error: null };
      }),
      updatePlayer: jest.fn(async (id: string, fields: GuestPlayerFields): Promise<{ changed: boolean } & Result> => {
        updates.push([id, fields]);
        return { changed: true, error: null };
      }),
    },
  };
}

describe('guestRows', () => {
  it('should keep only guest-only identities so a roster row is never written', () => {
    expect(guestRows([guest('g-1'), guest('p-1', { is_guest_only: false })]).map((p) => p.remote_id))
      .toEqual(['g-1']);
  });

  it('should treat a missing bucket as empty', () => {
    expect(guestRows(undefined)).toEqual([]);
  });
});

describe('toGuestPlayerWrite', () => {
  it('should build the guest shape the insert policy requires and nothing else', () => {
    expect(toGuestPlayerWrite(guest('g-1', { email: 'x@example.com', notes: 'secret' }))).toEqual({
      id: 'g-1', team_id: null, first_name: 'Sam', last_name: 'Late', jersey_number: 44,
      is_guest_only: true, is_active: true,
    });
  });

  it('should send a null jersey when the guest has none', () => {
    expect(toGuestPlayerWrite(guest('g-1', { jersey_number: undefined })).jersey_number).toBeNull();
  });
});

describe('isDuplicateKey', () => {
  it('should recognize Postgres 23505 and nothing else', () => {
    expect(isDuplicateKey(DUPLICATE)).toBe(true);
    expect(isDuplicateKey(RLS_REFUSAL)).toBe(false);
  });
});

describe('pushGuestPlayers', () => {
  it('should insert a new guest and register it in the league without a redundant edit', async () => {
    const server = fakeServer();
    const result = await pushGuestPlayers([guest('g-1')], [], [registration('g-1')], server.writers);
    expect(result).toEqual({ errors: [], failedIds: new Set() });
    expect(server.insertedPlayers).toEqual(['g-1']);
    expect(server.registered).toEqual(['g-1']);
    expect(server.updates).toEqual([]);
  });

  it('should treat a guest an earlier half-failed cycle already inserted as done and send its latest name', async () => {
    const server = fakeServer([], ['g-1']);
    const result = await pushGuestPlayers([guest('g-1', { jersey_number: 9 })], [], [], server.writers);
    expect(result).toEqual({ errors: [], failedIds: new Set() });
    expect(server.updates).toEqual([['g-1', { first_name: 'Sam', last_name: 'Late', jersey_number: 9 }]]);
  });

  it('should still insert the new guests when one in the batch already exists', async () => {
    const server = fakeServer([], ['g-old']);
    const result = await pushGuestPlayers([guest('g-old'), guest('g-new')], [], [], server.writers);
    expect(result.errors).toEqual([]);
    expect(server.insertedPlayers).toEqual(['g-new']);
    expect(server.updates.map(([id]) => id)).toEqual(['g-old']);
  });

  it('should send an edited guest through the edit call only', async () => {
    const server = fakeServer();
    await pushGuestPlayers([], [guest('g-1', { jersey_number: 7 })], [], server.writers);
    expect(server.writers.insertPlayers).not.toHaveBeenCalled();
    expect(server.updates).toEqual([['g-1', { first_name: 'Sam', last_name: 'Late', jersey_number: 7 }]]);
  });

  it('should report an edit the server did not store so it stays unsynced', async () => {
    const server = fakeServer();
    server.writers.updatePlayer.mockImplementation(async () => ({ changed: false, error: null }));
    const result = await pushGuestPlayers([], [guest('g-1')], [], server.writers);
    expect(result.errors).toEqual(['guest player update g-1: not stored (not a guest in one of your leagues)']);
    expect(result.failedIds).toEqual(new Set());
  });

  it('should retry a refused batch row by row so one bad guest does not hold back the others', async () => {
    const server = fakeServer(['g-bad']);
    const result = await pushGuestPlayers(
      [guest('g-1'), guest('g-bad'), guest('g-2')],
      [],
      [registration('g-1'), registration('g-bad'), registration('g-2')],
      server.writers,
    );
    expect(server.insertedPlayers).toEqual(['g-1', 'g-2']);
    expect(server.registered).toEqual(['g-1', 'g-2']);
    expect(result.failedIds).toEqual(new Set(['g-bad']));
    expect(result.errors).toEqual([
      'guest player insert g-bad: new row violates row-level security policy for table "players" (code 42501)',
    ]);
  });

  it('should not register or edit a guest the server refused', async () => {
    const server = fakeServer(['g-bad']);
    await pushGuestPlayers([guest('g-bad')], [guest('g-bad')], [registration('g-bad')], server.writers);
    expect(server.writers.registerInLeague).not.toHaveBeenCalled();
    expect(server.updates).toEqual([]);
  });

  it('should report a refused single guest without retrying it', async () => {
    const server = fakeServer(['g-bad']);
    const result = await pushGuestPlayers([guest('g-bad')], [], [], server.writers);
    expect(server.playerCalls).toEqual([['g-bad']]);
    expect(result.failedIds).toEqual(new Set(['g-bad']));
  });

  it('should treat a league registration that already exists as done', async () => {
    const server = fakeServer();
    server.writers.registerInLeague.mockImplementation(async () => ({ error: DUPLICATE }));
    const result = await pushGuestPlayers([guest('g-1')], [], [registration('g-1')], server.writers);
    expect(result.errors).toEqual([]);
  });

  it('should report a refused league registration without failing the guest itself', async () => {
    const server = fakeServer();
    server.writers.registerInLeague.mockImplementation(async () => ({ error: { code: '42501', message: 'refused' } }));
    const result = await pushGuestPlayers([guest('g-1')], [], [registration('g-1')], server.writers);
    expect(result.failedIds).toEqual(new Set());
    expect(result.errors).toEqual(['league_players insert league-1/g-1: refused (code 42501)']);
  });

  it('should report a failed edit call as an error without marking the guest missing', async () => {
    const server = fakeServer();
    server.writers.updatePlayer.mockImplementation(async () => ({ changed: false, error: { message: 'timeout' } }));
    const result = await pushGuestPlayers([], [guest('g-1')], [], server.writers);
    expect(result.failedIds).toEqual(new Set());
    expect(result.errors).toEqual(['guest player update g-1: timeout']);
  });

  it('should do nothing when there is nothing to push', async () => {
    const server = fakeServer();
    expect(await pushGuestPlayers([], [], [], server.writers)).toEqual({ errors: [], failedIds: new Set() });
    expect(server.writers.insertPlayers).not.toHaveBeenCalled();
    expect(server.writers.registerInLeague).not.toHaveBeenCalled();
  });
});
