import { listLeagueSeasons, resolveLeagueSeasonGameIds } from '../season';

function fakeDb(seasonsRows: { id?: string; name?: string; season_id?: string }[]) {
  return {
    from(table: string) {
      const query: any = {
        select() {
          return query;
        },
        in() {
          return query;
        },
        then(resolve: (value: unknown) => unknown) {
          const rows = table === 'tournament_teams'
            ? seasonsRows.filter((row) => row.season_id)
            : seasonsRows.filter((row) => row.name);
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return query;
    },
  } as any;
}

describe('listLeagueSeasons', () => {
  it('returns distinct season names across the league team ids, name desc', async () => {
    const db = fakeDb([
      { id: 's1', name: 'Spring 2026' },
      { id: 's2', name: 'Fall 2025' },
      { id: 's3', name: 'Spring 2026' },
    ]);
    const out = await listLeagueSeasons(db, ['t1', 't2']);
    expect(out).toEqual(['Spring 2026', 'Fall 2025']);
  });

  it('returns [] when there are no teams', async () => {
    expect(await listLeagueSeasons(fakeDb([]), [])).toEqual([]);
  });

  it('hides tournament-only seasons from regular league season navigation', async () => {
    const db = fakeDb([
      { id: 'regular-season', name: 'Spring 2026' },
      { id: 'tournament-season', season_id: 'tournament-season', name: 'Cup Tournament' },
    ]);

    expect(await listLeagueSeasons(db, ['team-one'])).toEqual(['Spring 2026']);
  });
});

describe('resolveLeagueSeasonGameIds', () => {
  it('only resolves regular completed games and excludes tournament games', async () => {
    const filters: Record<string, Record<string, unknown>> = {};
    const db = {
      from(table: string) {
        filters[table] = {};
        const query = {
          select() { return query; },
          in(column: string, value: unknown) { filters[table][column] = value; return query; },
          eq(column: string, value: unknown) { filters[table][column] = value; return query; },
          is(column: string, value: unknown) { filters[table][column] = value; return query; },
          then(resolve: (value: unknown) => unknown) {
            const data = table === 'seasons' ? [{ id: 'regular-season' }] : [{ id: 'regular-game' }];
            return Promise.resolve({ data, error: null }).then(resolve);
          },
        };
        return query;
      },
    };

    const ids = await resolveLeagueSeasonGameIds(db as never, ['team-one'], 'Spring 2026');

    expect(ids).toEqual(['regular-game']);
    expect(filters.games).toMatchObject({ status: 'completed', tournament_id: null });
  });
});
