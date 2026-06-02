import { listLeagueSeasons } from '../season';

function fakeDb(seasonsRows: { name: string }[]) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        in() {
          return Promise.resolve({ data: seasonsRows, error: null });
        },
      } as any;
    },
  } as any;
}

describe('listLeagueSeasons', () => {
  it('returns distinct season names across the league team ids, name desc', async () => {
    const db = fakeDb([{ name: 'Spring 2026' }, { name: 'Fall 2025' }, { name: 'Spring 2026' }]);
    const out = await listLeagueSeasons(db, ['t1', 't2']);
    expect(out).toEqual(['Spring 2026', 'Fall 2025']);
  });

  it('returns [] when there are no teams', async () => {
    expect(await listLeagueSeasons(fakeDb([]), [])).toEqual([]);
  });
});
