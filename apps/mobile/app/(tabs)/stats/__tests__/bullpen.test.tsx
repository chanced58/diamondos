import { fireEvent, render, screen } from '@testing-library/react-native';
import { PitcherAvailabilityStatus, PitcherEligibilitySource, type BullpenResponse } from '@baseball/shared';

jest.mock('expo-router', () => ({ __esModule: true, Stack: { Screen: () => null } }));

const mockUseCan = jest.fn();
jest.mock('../../../../src/providers/RoleProvider', () => ({
  useRole: () => ({ activeTeam: { teamId: 'team-1' } }),
  useCan: (capability: string) => mockUseCan(capability),
}));
jest.mock('../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));

const mockUseBullpenPlan = jest.fn();
jest.mock('../../../../src/features/stats/season-stats-api', () => ({
  useBullpenPlan: (teamId: string | undefined, date?: string) => mockUseBullpenPlan(teamId, date),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const BullpenScreen = require('../bullpen').default;

const plan: BullpenResponse = {
  teamId: 'team-1',
  date: '2026-10-24',
  dateSource: 'next_game',
  rule: { ruleName: 'NFHS (High School)', maxPitchesPerDay: 110 },
  pitchers: [
    {
      playerId: 'p1', firstName: 'Luke', lastName: 'Fox', jerseyNumber: 17, throws: 'right', eligibility: PitcherEligibilitySource.PRIMARY,
      status: PitcherAvailabilityStatus.UNAVAILABLE, pitchesLast7d: 70, nextAvailableDate: '2026-10-23', remainingPitches: null,
      reason: 'Threw 70 on 2026-10-20 — needs 2 rest days.',
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseCan.mockReturnValue(true);
  // The last plan stays up while the next day loads (placeholder data).
  mockUseBullpenPlan.mockReturnValue({ data: plan, isPending: false, isRefetching: false, refetch: jest.fn() });
});

it("should open on the next game's day and list each pitcher's status", () => {
  render(<BullpenScreen />);

  expect(mockUseBullpenPlan).toHaveBeenLastCalledWith('team-1', undefined);
  expect(screen.getByText('Sat, Oct 24')).toBeTruthy();
  expect(screen.getByText('Next game')).toBeTruthy();
  expect(screen.getByText('Unavailable')).toBeTruthy();
});

it('should step a day per tap even while the previous day is still on screen', () => {
  render(<BullpenScreen />);

  fireEvent.press(screen.getByLabelText('Previous day'));
  fireEvent.press(screen.getByLabelText('Previous day'));
  expect(mockUseBullpenPlan).toHaveBeenLastCalledWith('team-1', '2026-10-22');
  expect(screen.getByText('Thu, Oct 22')).toBeTruthy();

  fireEvent.press(screen.getByLabelText('Back to the next game'));
  expect(mockUseBullpenPlan).toHaveBeenLastCalledWith('team-1', undefined);
});

it('should keep the planner from anyone but coaches', () => {
  mockUseCan.mockReturnValue(false);
  render(<BullpenScreen />);

  expect(screen.getByText('Only coaches can use the bullpen planner.')).toBeTruthy();
  expect(mockUseBullpenPlan).toHaveBeenLastCalledWith(undefined, undefined);
});
