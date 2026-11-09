import { BATTING_COLUMNS, PITCHING_COLUMNS } from '../columns';
import { computeRankTable, type StatsPlayer } from '../ranks';
import { visiblePlayers, cardItems, type ViewState } from '../view';

const mins = { paMin: 10, ipOutsMin: 9 };

function p(over: Partial<StatsPlayer> & { playerId: string }): StatsPlayer {
  return {
    name: over.playerId, teamId: 'hawks', teamName: 'Hawks', pa: 20, ipOuts: 0,
    stats: {}, mine: false, ourTeam: false, ...over,
  };
}
const bat = (playerId: string, avg: number, extra: Partial<StatsPlayer> = {}) =>
  p({ playerId, stats: { avg, homeRuns: 1 }, ...extra });

const state = (over: Partial<ViewState> = {}): ViewState => ({
  teamId: 'all', query: '', qualifiedOnly: false, sortKey: 'avg', sortDir: 'desc', ...over,
});

const players = [
  bat('ann', 0.4),
  bat('bob', 0.3, { pa: 6 }),
  bat('cy', 0.35, { teamId: 'owls', teamName: 'Owls', mine: true, pa: 3 }),
  bat('dee', 0.2, { teamId: 'owls', teamName: 'Owls' }),
  p({ playerId: 'pit', ipOuts: 12, pa: 0, stats: { era: 2 } }),
];
const ranks = computeRankTable(players, BATTING_COLUMNS, 'batting', mins);
const ids = (ps: StatsPlayer[]) => ps.map((x) => x.playerId);

describe('visiblePlayers', () => {
  it('filters by tab activity', () => {
    expect(ids(visiblePlayers(players, 'batting', state(), ranks, null))).not.toContain('pit');
  });

  it('search shows unqualified matches even with qualifiedOnly on', () => {
    const r = visiblePlayers(players, 'batting', state({ qualifiedOnly: true, query: 'BO' }), ranks, null);
    expect(ids(r)).toEqual(['bob']);
  });

  it("qualifiedOnly hides unqualified rows but keeps the viewer's own row", () => {
    const r = visiblePlayers(players, 'batting', state({ qualifiedOnly: true }), ranks, null);
    expect(ids(r)).toEqual(['ann', 'dee', 'cy']);
    const sel = visiblePlayers(players, 'batting', state({ qualifiedOnly: true }), ranks, 'bob');
    expect(ids(sel)).toContain('bob');
  });

  it('qualifiedOnly is ignored when ranks are null', () => {
    const r = visiblePlayers(players, 'batting', state({ qualifiedOnly: true }), null, null);
    expect(ids(r)).toEqual(['ann', 'cy', 'bob', 'dee']);
  });

  it("team filter applies to the viewer's own row too", () => {
    const r = visiblePlayers(players, 'batting', state({ teamId: 'hawks' }), ranks, null);
    expect(ids(r)).not.toContain('cy');
  });

  it('unranked rows sort after ranked rows', () => {
    const r = visiblePlayers(players, 'batting', state({ sortDir: 'asc' }), ranks, null);
    expect(ids(r)).toEqual(['dee', 'ann', 'bob', 'cy']);
  });

  it('sorting by name ignores ranking', () => {
    const r = visiblePlayers(players, 'batting', state({ sortKey: 'name', sortDir: 'desc' }), ranks, null);
    expect(ids(r)).toEqual(['dee', 'cy', 'bob', 'ann']);
  });
});

describe('cardItems', () => {
  it('shows "Needs 4 more PA" for an unqualified batter', () => {
    const items = cardItems(players[1], 'batting', ranks, mins);
    const avg = items.find((i) => i.label === 'AVG')!;
    expect(avg.needs).toBe('Needs 4 more PA');
    expect(avg.rank?.league).toBeNull();
    expect(avg.display).toBe('.300');
    expect(items.find((i) => i.label === 'HR')!.needs).toBeNull();
  });

  it('returns no ranks or needs when ranking is off', () => {
    for (const i of cardItems(players[1], 'batting', null, mins)) {
      expect(i.rank).toBeNull();
      expect(i.needs).toBeNull();
    }
  });

  it('maps pitching ip card to the IP lead column and formats IP needs', () => {
    const pit = p({ playerId: 'x', pa: 0, ipOuts: 4, stats: { era: 3 } });
    const pr = computeRankTable([pit], PITCHING_COLUMNS, 'pitching', mins);
    const items = cardItems(pit, 'pitching', pr, mins);
    expect(items.find((i) => i.label === 'IP')!.display).toBe('1.1');
    expect(items.find((i) => i.label === 'ERA')!.needs).toBe('Needs 1.2 more IP');
  });
});
