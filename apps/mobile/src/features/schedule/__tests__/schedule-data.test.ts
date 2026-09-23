import {
  buildScheduleState,
  buildSchedulePartialError,
  mapGameToScheduleItem,
  SCHEDULE_FULL_PAGE_ERROR,
  type ScheduleEventRow,
  type ScheduleFetchOutcome,
  type ScheduleGameRow,
  type SchedulePracticeRow,
} from '../schedule-data';

/**
 * Covers H4: schedule.tsx (and practices/index.tsx, tested separately)
 * used to swallow every fetch failure and render the empty-state copy,
 * telling an offline coach "nothing scheduled". `buildScheduleState` is the
 * pure seam that decides full-page error vs. partial-failure banner vs. the
 * genuine empty state — extracted here per the brief's Part 3 guidance,
 * since exercising this via the real screen component would require mocking
 * WatermelonDB's `database.get(...).query(...).fetch()`, Supabase, and
 * RoleProvider all at once for marginal additional coverage.
 */

function mkGame(overrides: Partial<ScheduleGameRow> = {}): ScheduleGameRow {
  return {
    remoteId: 'game-1',
    teamId: 'team-1',
    opponentName: 'Wildcats',
    scheduledAt: Date.UTC(2026, 8, 20, 18, 0, 0),
    status: 'scheduled',
    ...overrides,
  };
}

function mkPractice(overrides: Partial<SchedulePracticeRow> = {}): SchedulePracticeRow {
  return {
    id: 'practice-1',
    scheduled_at: new Date(Date.UTC(2026, 8, 21, 16, 0, 0)).toISOString(),
    location: 'Field 3',
    run_status: 'scheduled',
    ...overrides,
  };
}

function mkEvent(overrides: Partial<ScheduleEventRow> = {}): ScheduleEventRow {
  return {
    id: 'event-1',
    starts_at: new Date(Date.UTC(2026, 8, 22, 12, 0, 0)).toISOString(),
    title: 'Team photos',
    location: null,
    ...overrides,
  };
}

const ok = <T>(data: T[]): ScheduleFetchOutcome<T> => ({ data, failed: false });
const fail = <T>(): ScheduleFetchOutcome<T> => ({ data: [], failed: true });

describe('mapGameToScheduleItem', () => {
  it('normalises the WatermelonDB ms-number scheduledAt to an ISO string', () => {
    const item = mapGameToScheduleItem(mkGame({ scheduledAt: Date.UTC(2026, 8, 20, 18, 0, 0) }));
    expect(item.startsAt).toBe('2026-09-20T18:00:00.000Z');
    expect(typeof item.startsAt).toBe('string');
  });

  it('uses game.remoteId (not the local WDB row id) as the routed gameId', () => {
    const item = mapGameToScheduleItem(mkGame({ remoteId: 'remote-42' }));
    expect(item.href).toMatchObject({
      pathname: '/(tabs)/games/[gameId]/score',
      params: { gameId: 'remote-42' },
    });
  });

  it('preserves teamId and opponentName on the href params exactly', () => {
    const item = mapGameToScheduleItem(
      mkGame({ teamId: 'team-9', opponentName: 'Panthers', status: 'in_progress' }),
    );
    expect(item.href).toMatchObject({
      params: { teamId: 'team-9', opponentName: 'Panthers' },
    });
  });

  it('omits href for a non-openable status', () => {
    const item = mapGameToScheduleItem(mkGame({ status: 'cancelled' }));
    expect(item.href).toBeUndefined();
  });
});

describe('buildScheduleState', () => {
  it('a failed games read surfaces the full-page error, not the empty copy', () => {
    const state = buildScheduleState({
      games: fail(),
      practices: ok([]),
      events: ok([]),
    });
    expect(state.items).toEqual([]);
    expect(state.fullPageError).toBe(SCHEDULE_FULL_PAGE_ERROR);
    expect(state.partialError).toBeNull();
  });

  it('a successful-but-empty read across all sources surfaces no error (genuine empty state)', () => {
    const state = buildScheduleState({
      games: ok([]),
      practices: ok([]),
      events: ok([]),
    });
    expect(state.items).toEqual([]);
    expect(state.fullPageError).toBeNull();
    expect(state.partialError).toBeNull();
  });

  it('games plus a failed practices read yields the partial-failure banner with games still listed', () => {
    const state = buildScheduleState({
      games: ok([mkGame()]),
      practices: fail(),
      events: ok([]),
    });
    expect(state.fullPageError).toBeNull();
    expect(state.partialError).toBe(buildSchedulePartialError(['practices']));
    expect(state.items).toHaveLength(1);
    expect(state.items[0].kind).toBe('game');
  });

  it('merges and sorts items from all three sources by startsAt', () => {
    const state = buildScheduleState({
      games: ok([mkGame({ scheduledAt: Date.UTC(2026, 8, 22, 18, 0, 0) })]),
      practices: ok([mkPractice()]),
      events: ok([mkEvent()]),
    });
    expect(state.items.map((i) => i.kind)).toEqual(['practice', 'event', 'game']);
  });

  it('sorts by actual instant, not lexical string order, across differing UTC offsets', () => {
    // Games are normalised via toISOString() (always "...Z"), but practices
    // and events keep whatever PostgREST returns, which can carry a
    // non-"Z" offset. A game at 20:00 UTC and an event at 18:00 in UTC-08:00
    // (== 02:00 UTC the next day) sort backwards under `localeCompare`
    // (the "T20" event string is lexically greater than "T18") but must sort
    // forward — game first — once compared by actual instant.
    const state = buildScheduleState({
      games: ok([mkGame({ scheduledAt: Date.UTC(2026, 8, 20, 20, 0, 0) })]),
      practices: ok([]),
      events: ok([mkEvent({ id: 'event-offset', starts_at: '2026-09-20T18:00:00-08:00' })]),
    });
    expect(state.items.map((i) => i.kind)).toEqual(['game', 'event']);
  });

  it('everything failing with nothing loaded is still the full-page error, not the partial banner', () => {
    const state = buildScheduleState({
      games: fail(),
      practices: fail(),
      events: fail(),
    });
    expect(state.fullPageError).toBe(SCHEDULE_FULL_PAGE_ERROR);
    expect(state.partialError).toBeNull();
  });

  it('mentions only the sources that actually failed, singular', () => {
    const state = buildScheduleState({
      games: ok([]),
      practices: ok([mkPractice()]),
      events: fail(),
    });
    expect(state.partialError).toBe("Events couldn't be loaded.");
  });

  it('mentions only games when only the local games read fails', () => {
    const state = buildScheduleState({
      games: fail(),
      practices: ok([mkPractice()]),
      events: ok([]),
    });
    expect(state.partialError).toBe("Games couldn't be loaded.");
  });

  it('mentions both failed sources with "and" when games and practices fail but an event loads', () => {
    const state = buildScheduleState({
      games: fail(),
      practices: fail(),
      events: ok([mkEvent()]),
    });
    expect(state.partialError).toBe(buildSchedulePartialError(['games', 'practices']));
    expect(state.partialError).toBe("Games and Practices couldn't be loaded.");
  });
});

describe('buildSchedulePartialError', () => {
  it('formats a single failed source without a conjunction', () => {
    expect(buildSchedulePartialError(['practices'])).toBe("Practices couldn't be loaded.");
  });

  it('formats two failed sources with "and"', () => {
    expect(buildSchedulePartialError(['practices', 'events'])).toBe(
      "Practices and Events couldn't be loaded.",
    );
  });

  it('formats three failed sources with an Oxford comma', () => {
    expect(buildSchedulePartialError(['games', 'practices', 'events'])).toBe(
      "Games, Practices, and Events couldn't be loaded.",
    );
  });
});
