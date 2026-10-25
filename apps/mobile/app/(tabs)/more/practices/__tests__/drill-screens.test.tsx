import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    back: () => mockBack(),
  },
  // Render the header's right button so tests can press it.
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => JSX.Element } }) => options?.headerRight?.() ?? null },
  useLocalSearchParams: () => mockParams(),
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
}));
const mockRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
jest.mock('../../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));
jest.mock('../../../../../src/features/places/VenueSearchField', () => ({ VenueSearchField: () => null }));
jest.mock('../../../../../src/features/practices/practices-api', () => ({ practicesQueryKey: (id: string) => ['teams', id, 'practices'] }));
const mockUseDrills = jest.fn();
const mockUseDrill = jest.fn();
const mockDelete = jest.fn();
const mockPlan = jest.fn();
jest.mock('../../../../../src/features/practices/drills-api', () => ({
  drillsQueryKey: (id: string) => ['teams', id, 'drills'],
  useDrills: (...args: unknown[]) => mockUseDrills(...args),
  useDrill: (...args: unknown[]) => mockUseDrill(...args),
  deleteDrill: (...args: unknown[]) => mockDelete(...args),
  planPractice: (...args: unknown[]) => mockPlan(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const DrillLibraryScreen = require('../drills/index').default;
const DrillDetailScreen = require('../drills/[drillId]/index').default;
const PlanPracticeScreen = require('../plan').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const TEAM = '11111111-1111-4111-8111-111111111111';
const TEE = '22222222-2222-4222-8222-222222222222';
const TOSS = '33333333-3333-4333-8333-333333333333';
const drill = (id: string, name: string, extra = {}) => ({
  id, teamId: null, visibility: 'system', name, skillCategories: ['hitting'], positions: [], ageLevels: ['all'],
  equipment: [], fieldSpaces: [], tags: [], createdAt: '', updatedAt: '', ...extra,
});
const library = { teamId: TEAM, isCoach: true, drills: [drill(TEE, 'Tee work', { defaultDurationMinutes: 15 }), drill(TOSS, 'Soft toss', { visibility: 'team', teamId: TEAM })] };
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true }, loading: false });
});

describe('DrillLibraryScreen', () => {
  it('should search the library and open a drill', () => {
    mockUseDrills.mockReturnValue({ data: library });
    renderWithQuery(<DrillLibraryScreen />);
    expect(screen.getByText('2 drills')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('Search drills'), 'tee');
    expect(screen.queryByText('Soft toss')).toBeNull();
    fireEvent.press(screen.getByText('Tee work'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/drills/[drillId]', params: { drillId: TEE } });

    fireEvent.press(screen.getByLabelText('New drill'));
    expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/more/practices/drills/new');
  });

  it("should show only the team's own drills, and no + to a player", () => {
    mockUseDrills.mockReturnValue({ data: { ...library, isCoach: false } });
    renderWithQuery(<DrillLibraryScreen />);
    fireEvent.press(screen.getByText('Our drills'));
    expect(screen.queryByText('Tee work')).toBeNull();
    expect(screen.getByText('Soft toss')).toBeTruthy();
    expect(screen.queryByLabelText('New drill')).toBeNull();
  });
});

describe('DrillDetailScreen', () => {
  it('should delete a team drill after confirming', async () => {
    mockParams.mockReturnValue({ drillId: TOSS });
    mockUseDrill.mockReturnValue({
      data: { drill: library.drills[1], canEdit: true, fixes: { primary: [{ id: 'f1', name: 'Late swing' }], secondary: [] } },
    });
    mockDelete.mockResolvedValue({ drillId: TOSS });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'Delete')?.onPress?.();
    });
    renderWithQuery(<DrillDetailScreen />);
    expect(screen.getByText('Primary: Late swing')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Delete drill'));
      await settle();
    });
    expect(mockDelete).toHaveBeenCalledWith(TOSS);
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should offer no edits on a curated drill', () => {
    mockParams.mockReturnValue({ drillId: TEE });
    mockUseDrill.mockReturnValue({ data: { drill: library.drills[0], canEdit: false, fixes: { primary: [], secondary: [] } } });
    renderWithQuery(<DrillDetailScreen />);
    expect(screen.getByText('Curated')).toBeTruthy();
    expect(screen.queryByText('Edit drill')).toBeNull();
  });

  it('should offer only a web video link', () => {
    mockParams.mockReturnValue({ drillId: TEE });
    const detail = (videoUrl: string) => ({ data: { drill: { ...library.drills[0], videoUrl }, canEdit: false, fixes: { primary: [], secondary: [] } } });
    mockUseDrill.mockReturnValue(detail('tel:5551234'));
    const { unmount } = renderWithQuery(<DrillDetailScreen />);
    expect(screen.queryByText('Watch the video')).toBeNull();
    unmount();

    mockUseDrill.mockReturnValue(detail('https://example.com/video'));
    renderWithQuery(<DrillDetailScreen />);
    expect(screen.getByText('Watch the video')).toBeTruthy();
  });
});

describe('PlanPracticeScreen', () => {
  it('should create a practice from the picked drills in the order shown', async () => {
    mockUseDrills.mockReturnValue({ data: library, isPending: false });
    mockPlan.mockResolvedValue({ practiceId: 'p1' });
    renderWithQuery(<PlanPracticeScreen />);

    fireEvent.press(screen.getByText('Pick drills'));
    fireEvent.press(screen.getByLabelText('Tee work'));
    fireEvent.press(screen.getByLabelText('Soft toss'));
    fireEvent.press(screen.getByText('Done'));
    expect(screen.getByText('Drills · 25 min')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Move Soft toss up'));
    fireEvent.changeText(screen.getByLabelText('Practice plan'), 'Timing day');
    await act(async () => {
      fireEvent.press(screen.getByText('Create practice'));
      await settle();
    });

    expect(mockPlan).toHaveBeenCalledWith(TEAM, expect.objectContaining({ plan: 'Timing day', drillIds: [TOSS, TEE] }));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: 'p1' } }),
    );
  });

  it('should turn away non-coaches', () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: false }, loading: false });
    mockUseDrills.mockReturnValue({ data: undefined, isPending: false });
    renderWithQuery(<PlanPracticeScreen />);
    expect(screen.getByText('Only coaches can plan practices.')).toBeTruthy();
  });
});
