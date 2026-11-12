import {
  guestRows,
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

function guest(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    remote_id: id, team_id: null, first_name: 'Sam', last_name: 'Late',
    jersey_number: 44, is_guest_only: true, is_active: true, ...extra,
  };
}

function registration(playerId: string, leagueId = 'league-1'): Record<string, unknown> {
  return { league_id: leagueId, player_remote_id: playerId };
}

/** A fake server: refuses any statement that contains one of `refusedIds`. */
function fakeServer(refusedPlayerIds: string[] = []) {
  const insertedPlayers: string[] = [];
  const registered: string[] = [];
  const updates: Array<[string, GuestPlayerFields]> = [];
  const playerCalls: string[][] = [];
  return {
    insertedPlayers, registered, updates, playerCalls,
    writers: {
      insertPlayers: jest.fn(async (writes: GuestPlayerWrite[]): Promise<{ error: PushError | null }> => {
        playerCalls.push(writes.map((w) => w.id));
        if (writes.some((w) => refusedPlayerIds.includes(w.id))) return { error: RLS_REFUSAL };
        insertedPlayers.push(...writes.map((w) => w.id));
        return { error: null };
      }),
      registerInLeague: jest.fn(async (writes: GuestLeagueRegistration[]): Promise<{ error: PushError | null }> => {
        registered.push(...writes.map((w) => w.player_id));
        return { error: null };
      }),
      updatePlayer: jest.fn(async (id: string, fields: GuestPlayerFields): Promise<{ error: PushError | null }> => {
        updates.push([id, fields]);
        return { error: null };
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

describe('pushGuestPlayers', () => {
  it('should insert a new guest, register it in the league and send its name', async () => {
    const server = fakeServer();
    const result = await pushGuestPlayers([guest('g-1')], [], [registration('g-1')], server.writers);
    expect(result).toEqual({ errors: [], failedIds: new Set() });
    expect(server.insertedPlayers).toEqual(['g-1']);
    expect(server.registered).toEqual(['g-1']);
    expect(server.updates).toEqual([['g-1', { first_name: 'Sam', last_name: 'Late', jersey_number: 44 }]]);
  });

  it('should send an edited guest as an update only', async () => {
    const server = fakeServer();
    await pushGuestPlayers([], [guest('g-1', { jersey_number: 7 })], [], server.writers);
    expect(server.writers.insertPlayers).not.toHaveBeenCalled();
    expect(server.updates).toEqual([['g-1', { first_name: 'Sam', last_name: 'Late', jersey_number: 7 }]]);
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
    expect(result.failedIds).toEqual(new Set(['g-bad']));
    expect(result.errors).toEqual([
      'guest player insert g-bad: new row violates row-level security policy for table "players" (code 42501)',
    ]);
  });

  it('should not register or update a guest the server refused', async () => {
    const server = fakeServer(['g-bad']);
    await pushGuestPlayers([guest('g-bad')], [], [registration('g-bad')], server.writers);
    expect(server.writers.registerInLeague).not.toHaveBeenCalled();
    expect(server.updates).toEqual([]);
  });

  it('should report a refused single guest without retrying it', async () => {
    const server = fakeServer(['g-bad']);
    const result = await pushGuestPlayers([guest('g-bad')], [], [], server.writers);
    expect(server.playerCalls).toEqual([['g-bad']]);
    expect(result.failedIds).toEqual(new Set(['g-bad']));
  });

  it('should report a refused league registration without failing the guest itself', async () => {
    const server = fakeServer();
    server.writers.registerInLeague.mockImplementation(async () => ({ error: { code: '42501', message: 'refused' } }));
    const result = await pushGuestPlayers([guest('g-1')], [], [registration('g-1')], server.writers);
    expect(result.failedIds).toEqual(new Set());
    expect(result.errors).toEqual(['league_players insert league-1/g-1: refused (code 42501)']);
  });

  it('should report a failed update as an error without marking the guest missing', async () => {
    const server = fakeServer();
    server.writers.updatePlayer.mockImplementation(async () => ({ error: { message: 'timeout' } }));
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
