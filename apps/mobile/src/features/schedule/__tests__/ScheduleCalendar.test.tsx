import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

/**
 * The month calendar. WatermelonDB can't run under Jest (its SQLite adapter is
 * native), so the games query and Supabase are both mocked; the merge, day
 * filing and failure states are covered in schedule-data's own tests.
 */

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    __esModule: true,
    router: { push: (...args: unknown[]) => mockPush(...args) },
    // Run the focus callback once, as on first focus.
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
const mockUseRole = jest.fn();
jest.mock('../../../providers/RoleProvider', () => ({ useRole: () => mockUseRole() }));

const mockGameRows: unknown[] = [];
jest.mock('../../../db', () => ({
  Game: class {},
  database: { get: () => ({ query: () => ({ fetch: async () => mockGameRows }) }) },
}));

const mockTables: Record<string, { data: unknown[]; error: unknown }> = {};
jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'gte', 'lte']) builder[method] = () => builder;
      builder.order = async () => mockTables[table] ?? { data: [], error: null };
      return builder;
    },
  }),
}));

// Pin "today" and the device zone so the month and day keys are stable.
jest.mock('../../games/game-form-model', () => ({ deviceTimeZone: () => 'America/Boise' }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScheduleCalendar } = require('../ScheduleCalendar');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date('2026-10-21T18:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  mockUseRole.mockReturnValue({ activeTeam: { teamId: 't1', isCoach: true }, loading: false });
  mockGameRows.length = 0;
  mockGameRows.push({
    remoteId: 'g1', teamId: 't1', opponentName: 'Eagles', scheduledAt: Date.UTC(2026, 9, 23, 0, 0),
    timeZone: 'America/Boise', status: 'scheduled', tournamentId: null, locationType: 'away', neutralHomeTeam: null,
  });
  mockTables.practices = { data: [{ id: 'p1', scheduled_at: '2026-10-21T23:00:00Z', location: 'Main field', run_status: 'planned' }], error: null };
  mockTables.team_events = { data: [], error: null };
});
afterEach(() => jest.useRealTimers());

it("should open on this month with today's agenda", async () => {
  render(<ScheduleCalendar />);

  expect(screen.getByText('October 2026')).toBeTruthy();
  expect(screen.getByText('Wednesday, October 21')).toBeTruthy();
  // The practice at 5 PM Boise time is today's only item.
  await waitFor(() => expect(screen.getByText('Practice')).toBeTruthy());
  expect(screen.queryByText('Game @ Eagles')).toBeNull();
});

it("should show another day's items, filed by the game's own zone", async () => {
  render(<ScheduleCalendar />);
  await waitFor(() => expect(screen.getByText('Practice')).toBeTruthy());

  // 00:00 UTC Oct 23 is 6 PM Oct 22 in Boise.
  fireEvent.press(screen.getByLabelText('2026-10-22, game'));

  expect(screen.getByText('Thursday, October 22')).toBeTruthy();
  expect(screen.getByText('Game @ Eagles')).toBeTruthy();
});

it('should send a coach to practice attendance', async () => {
  render(<ScheduleCalendar />);
  await waitFor(() => expect(screen.getByText('Practice')).toBeTruthy());

  fireEvent.press(screen.getByText('Practice'));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(tabs)/more/practices/[practiceId]/attendance',
    params: { practiceId: 'p1' },
  });
});

it('should move between months', async () => {
  render(<ScheduleCalendar />);
  fireEvent.press(screen.getByLabelText('Next month'));
  expect(screen.getByText('November 2026')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Go to today'));
  expect(screen.getByText('October 2026')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Practice')).toBeTruthy());
});

it('should say which source failed instead of showing an empty day', async () => {
  mockTables.team_events = { data: [], error: { message: 'offline' } };
  render(<ScheduleCalendar />);
  await waitFor(() => expect(screen.getByText("Events couldn't be loaded.")).toBeTruthy());
});
