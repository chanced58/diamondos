import {
  isResolvedPlaceholder,
  pushOpponentPlayers,
  toOpponentPlayerWrite,
  type OpponentPlayerWrite,
  type PushError,
} from '../opponent-player-push';

const RLS_REFUSAL: PushError = {
  code: '42501',
  message: 'new row violates row-level security policy for table "opponent_players"',
};

function localRow(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    remote_id: id, opponent_team_id: 'ot-1', first_name: 'Ann', last_name: 'Lee',
    jersey_number: null, primary_position: null, is_active: true,
    placeholder_game_id: null, linked_player_id: null, is_fill_in: false,
    ...extra,
  };
}

/** A fake server: refuses any statement containing one of `refusedIds`. */
function fakeUpsert(refusedIds: string[], error: PushError = RLS_REFUSAL) {
  const written: string[] = [];
  const calls: string[][] = [];
  const upsert = jest.fn(async (writes: OpponentPlayerWrite[]) => {
    calls.push(writes.map((w) => w.id));
    if (writes.some((w) => refusedIds.includes(w.id))) return { error };
    written.push(...writes.map((w) => w.id));
    return { error: null };
  });
  return { upsert, written, calls };
}

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('toOpponentPlayerWrite', () => {
  it('should push placeholder_game_id for an unknown player added during a league game', () => {
    expect(toOpponentPlayerWrite({
      remote_id: 'op-9', opponent_team_id: 'ot-1', first_name: '', last_name: '',
      jersey_number: '12', primary_position: null, is_active: true, placeholder_game_id: 'lg-1',
    })).toEqual({
      id: 'op-9', opponent_team_id: 'ot-1', first_name: '', last_name: '',
      jersey_number: '12', primary_position: null, is_active: true, placeholder_game_id: 'lg-1',
    });
  });

  it('should push a null placeholder_game_id for an ordinary opponent player', () => {
    expect(toOpponentPlayerWrite({
      remote_id: 'op-1', opponent_team_id: 'ot-1', first_name: 'Ann', last_name: 'Lee', is_active: true,
    })).toMatchObject({ placeholder_game_id: null });
  });

  it('should never send linked_player_id or is_fill_in', () => {
    const write = toOpponentPlayerWrite(localRow('op-1', {
      placeholder_game_id: 'lg-1', linked_player_id: 'p-1', is_fill_in: true,
    }));
    expect(write).not.toHaveProperty('linked_player_id');
    expect(write).not.toHaveProperty('is_fill_in');
  });
});

describe('isResolvedPlaceholder', () => {
  it('should treat a placeholder the pull showed matched or a fill-in as resolved', () => {
    expect(isResolvedPlaceholder(localRow('a', { placeholder_game_id: 'lg-1', linked_player_id: 'p-1' }))).toBe(true);
    expect(isResolvedPlaceholder(localRow('b', { placeholder_game_id: 'lg-1', is_fill_in: true }))).toBe(true);
  });

  it('should not treat an unmatched placeholder or a linked roster-record player as resolved', () => {
    expect(isResolvedPlaceholder(localRow('a', { placeholder_game_id: 'lg-1' }))).toBe(false);
    expect(isResolvedPlaceholder(localRow('b', { linked_player_id: 'p-1' }))).toBe(false);
  });
});

describe('pushOpponentPlayers', () => {
  it('should push every row in one statement when the server accepts them', async () => {
    const server = fakeUpsert([]);
    const result = await pushOpponentPlayers([localRow('a'), localRow('b')], server.upsert);
    expect(result).toEqual({ errors: [], droppedIds: [] });
    expect(server.calls).toEqual([['a', 'b']]);
  });

  it('should push the good rows and drop a placeholder the server already matched', async () => {
    // The device renamed placeholder "ph" offline; the server matched it
    // before the pull could tell the device, so RLS refuses the re-push.
    const rows = [
      localRow('a'),
      localRow('ph', { placeholder_game_id: 'lg-1', first_name: 'Renamed' }),
      localRow('b', { placeholder_game_id: 'lg-1' }),
    ];
    const server = fakeUpsert(['ph']);

    const result = await pushOpponentPlayers(rows, server.upsert);

    expect(result.errors).toEqual([]);
    expect(result.droppedIds).toEqual(['ph']);
    expect(server.written).toEqual(['a', 'b']);
  });

  it('should stop retrying a dropped placeholder on the next cycle once the pull shows it matched', async () => {
    const server = fakeUpsert(['ph']);
    const first = await pushOpponentPlayers(
      [localRow('ph', { placeholder_game_id: 'lg-1' })],
      server.upsert,
    );
    expect(first.errors).toEqual([]);

    // Had the row stayed dirty, the next cycle carries the pulled link and
    // the row is not sent at all.
    server.calls.length = 0;
    const next = await pushOpponentPlayers(
      [localRow('ph', { placeholder_game_id: 'lg-1', linked_player_id: 'p-1' }), localRow('c')],
      server.upsert,
    );
    expect(next).toEqual({ errors: [], droppedIds: ['ph'] });
    expect(server.calls).toEqual([['c']]);
  });

  it('should still fail the push when an ordinary opponent player is refused by RLS', async () => {
    const server = fakeUpsert(['ordinary']);
    const result = await pushOpponentPlayers(
      [localRow('a'), localRow('ordinary')],
      server.upsert,
    );
    expect(result.errors).toEqual([expect.stringContaining('opponent_players upsert ordinary')]);
    expect(result.droppedIds).toEqual([]);
    expect(server.written).toEqual(['a']);
  });

  it('should fail the push without retrying rows when the error is not an RLS refusal', async () => {
    const server = fakeUpsert(['a'], { code: '08006', message: 'connection failure' });
    const result = await pushOpponentPlayers(
      [localRow('a'), localRow('ph', { placeholder_game_id: 'lg-1' })],
      server.upsert,
    );
    expect(result).toEqual({
      errors: ['opponent_players upsert: connection failure'],
      droppedIds: [],
    });
    expect(server.calls).toHaveLength(1);
  });

  it('should recognise an RLS refusal by its message when no code is given', async () => {
    const server = fakeUpsert(['ph'], { message: 'new row violates row-level security policy' });
    const result = await pushOpponentPlayers(
      [localRow('ph', { placeholder_game_id: 'lg-1' }), localRow('a')],
      server.upsert,
    );
    expect(result).toEqual({ errors: [], droppedIds: ['ph'] });
    expect(server.written).toEqual(['a']);
  });
});
