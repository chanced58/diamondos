import {
  EMPTY_TEAM_BACKFILL,
  fetchAllByParentIds,
  fetchTeamBackfill,
  loadTeamBackfill,
  mergeRowsById,
  notifyTeamMembershipChange,
  parseKnownTeamIds,
  planTeamBackfill,
  subscribeToTeamMembershipChanges,
  type BackfillClient,
} from '../team-backfill';

type Row = Record<string, unknown>;

/**
 * Minimal in-memory stand-in for the Supabase query builder: supports the
 * select/in/eq/gt/order/limit chain team-backfill uses and resolves like a
 * PostgREST response. `eq` on a dotted embed column (channel_members.user_id)
 * filters on the embedded rows, as `!inner` does server-side.
 */
function fakeClient(tables: Record<string, Row[]>, failTable?: string): BackfillClient & { calls: string[] } {
  const calls: string[] = [];
  const client = {
    calls,
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let limit: number | null = null;
      const builder = {
        select() { return builder; },
        in(column: string, values: readonly unknown[]) {
          calls.push(`${table}.in(${column}:${values.length})`);
          rows = rows.filter((r) => values.includes(r[column]));
          return builder;
        },
        eq(column: string, value: unknown) {
          const [embed, field] = column.split('.');
          rows = field
            ? rows.filter((r) => (r[embed] as Row[] | undefined)?.some((e) => e[field] === value))
            : rows.filter((r) => r[column] === value);
          return builder;
        },
        gt(column: string, value: string) {
          rows = rows.filter((r) => String(r[column]) > value);
          return builder;
        },
        order(column: string) {
          rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])));
          return builder;
        },
        limit(n: number) { limit = n; return builder; },
        then(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) {
          if (table === failTable) return Promise.resolve(resolve({ data: null, error: { message: 'boom' } }));
          return Promise.resolve(resolve({ data: limit == null ? rows : rows.slice(0, limit), error: null }));
        },
      };
      return builder;
    },
  };
  return client as unknown as BackfillClient & { calls: string[] };
}

describe('planTeamBackfill', () => {
  it('backfills nothing on the first pull, which already reads every table from the beginning', () => {
    expect(planTeamBackfill({ knownTeamIds: null, currentTeamIds: ['a'], isFirstPull: true }))
      .toEqual({ backfillTeamIds: [], membershipChanged: false });
  });

  it('backfills only a team the user joined since the last sync', () => {
    expect(planTeamBackfill({ knownTeamIds: ['a'], currentTeamIds: ['a', 'b'], isFirstPull: false }))
      .toEqual({ backfillTeamIds: ['b'], membershipChanged: true });
  });

  it('backfills nothing and reports no change when the team set is unchanged', () => {
    expect(planTeamBackfill({ knownTeamIds: ['b', 'a'], currentTeamIds: ['a', 'b'], isFirstPull: false }))
      .toEqual({ backfillTeamIds: [], membershipChanged: false });
  });

  it('reports a change without backfilling when the user left a team', () => {
    expect(planTeamBackfill({ knownTeamIds: ['a', 'b'], currentTeamIds: ['a'], isFirstPull: false }))
      .toEqual({ backfillTeamIds: [], membershipChanged: true });
  });

  it('backfills every current team once on an install that synced before the register existed', () => {
    // Such a device may already have missed a team it joined, so it cannot
    // trust its checkpoint for any of them.
    expect(planTeamBackfill({ knownTeamIds: null, currentTeamIds: ['a', 'b'], isFirstPull: false }))
      .toEqual({ backfillTeamIds: ['a', 'b'], membershipChanged: true });
  });
});

describe('parseKnownTeamIds', () => {
  it('reads a stored list of team ids', () => {
    expect(parseKnownTeamIds('["a","b"]')).toEqual(['a', 'b']);
  });

  it('treats a missing register as unknown', () => {
    expect(parseKnownTeamIds(null)).toBeNull();
    expect(parseKnownTeamIds(undefined)).toBeNull();
  });

  it('treats a corrupt register as unknown so every team is backfilled rather than skipped', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(parseKnownTeamIds('{not json')).toBeNull();
      expect(parseKnownTeamIds('[1,2]')).toBeNull();
      expect(parseKnownTeamIds('"a"')).toBeNull();
      expect(warn).toHaveBeenCalledTimes(3);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('mergeRowsById', () => {
  it('unions both lists and lets the later list win for a shared id', () => {
    expect(mergeRowsById([{ id: '1', v: 'old' }, { id: '2' }], [{ id: '1', v: 'new' }, { id: '3' }]))
      .toEqual([{ id: '1', v: 'new' }, { id: '2' }, { id: '3' }]);
  });

  it('treats a null list as empty', () => {
    expect(mergeRowsById(null, [{ id: '1' }])).toEqual([{ id: '1' }]);
  });
});

describe('fetchTeamBackfill', () => {
  const tables: Record<string, Row[]> = {
    games: [
      { id: 'g1', team_id: 'new' },
      { id: 'g2', team_id: 'new' },
      { id: 'g-other', team_id: 'old' },
    ],
    game_events: [
      { id: 'e1', game_id: 'g1' },
      { id: 'e2', game_id: 'g2' },
      { id: 'e3', game_id: 'g2' },
      { id: 'e-other', game_id: 'g-other' },
    ],
    game_lineups: [{ id: 'l1', game_id: 'g1' }, { id: 'l-other', game_id: 'g-other' }],
    players: [{ id: 'p1', team_id: 'new' }, { id: 'p-other', team_id: 'old' }],
    channels: [
      { id: 'c1', team_id: 'new', channel_members: [{ user_id: 'me', can_post: true }] },
      { id: 'c-not-mine', team_id: 'new', channel_members: [{ user_id: 'someone', can_post: true }] },
    ],
    messages: [{ id: 'm1', channel_id: 'c1' }, { id: 'm-hidden', channel_id: 'c-not-mine' }],
    opponent_teams: [{ id: 'o1', team_id: 'new' }, { id: 'o-other', team_id: 'old' }],
    opponent_players: [{ id: 'op1', opponent_team_id: 'o1' }, { id: 'op-other', opponent_team_id: 'o-other' }],
  };
  const ids = (rows: Row[]) => rows.map((r) => r.id);

  it('returns every row the new team owns, across all synced tables, and nothing from other teams', async () => {
    const result = await fetchTeamBackfill(fakeClient(tables), ['new'], 'me');
    expect(ids(result.games)).toEqual(['g1', 'g2']);
    expect(ids(result.gameEvents)).toEqual(['e1', 'e2', 'e3']);
    expect(ids(result.gameLineups)).toEqual(['l1']);
    expect(ids(result.players)).toEqual(['p1']);
    expect(ids(result.channels)).toEqual(['c1']);
    expect(ids(result.messages)).toEqual(['m1']);
    expect(ids(result.opponentPlayers)).toEqual(['op1']);
  });

  it('pages past the server row cap instead of truncating a long event history', async () => {
    const result = await fetchTeamBackfill(fakeClient(tables), ['new'], 'me', { pageSize: 1 });
    expect(ids(result.gameEvents)).toEqual(['e1', 'e2', 'e3']);
  });

  it('skips the child-table queries when the team has no games, channels or opponents', async () => {
    const client = fakeClient(tables);
    const result = await fetchTeamBackfill(client, ['empty'], 'me');
    expect(result.games).toEqual([]);
    expect(client.calls.some((c) => c.startsWith('game_events'))).toBe(false);
    expect(client.calls.some((c) => c.startsWith('messages'))).toBe(false);
    expect(client.calls.some((c) => c.startsWith('opponent_players'))).toBe(false);
  });

  it('throws when any query fails, so the sync retries rather than recording the team as loaded', async () => {
    await expect(fetchTeamBackfill(fakeClient(tables, 'game_events'), ['new'], 'me'))
      .rejects.toThrow(/game_events/);
  });
});

describe('fetchAllByParentIds', () => {
  // 150 games, two lineup rows each: more parent ids than one request carries
  // and more rows than one page returns.
  const gameIds = Array.from({ length: 150 }, (_, i) => `g${String(i).padStart(3, '0')}`);
  const lineups = gameIds.flatMap((id) => [{ id: `${id}-a`, game_id: id }, { id: `${id}-b`, game_id: id }]);

  it('returns every matching row across id chunks and pages, so a capped response is never read as deletions', async () => {
    const client = fakeClient({ game_lineups: [...lineups, { id: 'other', game_id: 'not-asked' }] });
    const rows = await fetchAllByParentIds(client, {
      table: 'game_lineups', select: 'id', parentColumn: 'game_id', parentIds: gameIds, pageSize: 7,
    });
    expect(rows.map((r) => r.id).sort()).toEqual(lineups.map((r) => r.id).sort());
    expect(client.calls.filter((c) => c.startsWith('game_lineups')).every((c) => /:(100|50)\)$/.test(c))).toBe(true);
  });

  it('throws when a page fails, as the unpaged reads it replaces did', async () => {
    await expect(fetchAllByParentIds(fakeClient({ game_lineups: lineups }, 'game_lineups'), {
      table: 'game_lineups', select: 'id', parentColumn: 'game_id', parentIds: gameIds,
    })).rejects.toThrow(/game_lineups/);
  });
});

describe('loadTeamBackfill', () => {
  const tables: Record<string, Row[]> = { games: [{ id: 'g1', team_id: 'new' }] };

  it('records every current team once the backfill succeeds', async () => {
    const result = await loadTeamBackfill(fakeClient(tables), {
      currentTeamIds: ['old', 'new'], backfillTeamIds: ['new'], userId: 'me',
    });
    expect(result.backfill.games.map((r) => r.id)).toEqual(['g1']);
    expect(result.loadedTeamIds).toEqual(['old', 'new']);
  });

  it('skips the backfill without throwing, and leaves the failed teams unrecorded, so queued events still push', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await loadTeamBackfill(fakeClient(tables, 'games'), {
        currentTeamIds: ['old', 'new'], backfillTeamIds: ['new'], userId: 'me',
      });
      expect(result.backfill).toEqual(EMPTY_TEAM_BACKFILL);
      expect(result.loadedTeamIds).toEqual(['old']);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('team backfill failed'), ['new'], expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });

  it('makes no requests when no team needs a backfill', async () => {
    const client = fakeClient(tables);
    const result = await loadTeamBackfill(client, { currentTeamIds: ['old'], backfillTeamIds: [], userId: 'me' });
    expect(result).toEqual({ backfill: EMPTY_TEAM_BACKFILL, loadedTeamIds: ['old'] });
    expect(client.calls).toEqual([]);
  });
});

describe('team membership change notifications', () => {
  it('calls each subscriber until it unsubscribes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToTeamMembershipChanges(listener);
    notifyTeamMembershipChange();
    unsubscribe();
    notifyTeamMembershipChange();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps notifying other subscribers when one throws', () => {
    const failing = jest.fn(() => { throw new Error('listener broke'); });
    const healthy = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const unsubscribeFailing = subscribeToTeamMembershipChanges(failing);
    const unsubscribeHealthy = subscribeToTeamMembershipChanges(healthy);
    notifyTeamMembershipChange();
    expect(healthy).toHaveBeenCalledTimes(1);
    unsubscribeFailing();
    unsubscribeHealthy();
    warn.mockRestore();
  });
});
