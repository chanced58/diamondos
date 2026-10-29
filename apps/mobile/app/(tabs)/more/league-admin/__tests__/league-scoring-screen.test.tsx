import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { defaultLeagueScoringSettings } from '@baseball/shared';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';
import { ApiError } from '../../../../../src/lib/api-client';

const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams(),
}));
const mockUseSettings = jest.fn();
const mockSave = jest.fn();
jest.mock('../../../../../src/features/league-admin/league-admin-api', () => ({
  leagueScoringSettingsQueryKey: (leagueId: string) => ['league-admin', leagueId, 'scoring-settings'],
  useLeagueScoringSettings: (...args: unknown[]) => mockUseSettings(...args),
  saveLeagueScoringSettings: (...args: unknown[]) => mockSave(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const ScoringScreen = require('../[leagueId]/scoring').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const LEAGUE = '11111111-1111-4111-8111-111111111111';
const RULE = '44444444-4444-4444-8444-444444444444';
const data = (canEdit = true) => ({
  data: {
    league: { id: LEAGUE, name: 'Valley League' },
    canEdit,
    settings: defaultLeagueScoringSettings(),
    pitchRuleOptions: [{ id: RULE, label: 'NFHS (ages 13–18)' }],
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ leagueId: LEAGUE });
  mockUseSettings.mockReturnValue(data());
});

describe('LeagueScoringSettingsScreen', () => {
  it('should save the changed settings as one blob', async () => {
    mockSave.mockImplementation((_leagueId: string, settings: unknown) => Promise.resolve({ settings }));
    renderWithQuery(<ScoringScreen />);
    expect(screen.getByText('Save settings')).toBeTruthy();

    fireEvent(screen.getByLabelText('Dual scorekeeper'), 'valueChange', true);
    fireEvent(screen.getByLabelText('Mercy rule'), 'valueChange', true);
    fireEvent.press(screen.getByLabelText('Increase Run differential'));
    fireEvent.press(screen.getByLabelText('Decrease Regulation innings'));
    fireEvent.press(screen.getByText('NFHS (ages 13–18)'));
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();

    fireEvent.press(screen.getByText('Save settings'));
    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    const [leagueId, saved] = mockSave.mock.calls[0];
    expect(leagueId).toBe(LEAGUE);
    const expected = defaultLeagueScoringSettings();
    expected.scorekeeping.dualScorekeeper = true;
    expected.gameLength.mercy = { enabled: true, runDiff: 11, afterInning: 5 };
    expected.gameLength.maxInnings = 8;
    expected.compliance.defaultPitchRuleId = RULE;
    expect(saved).toEqual(expected);
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
  });

  it('should keep steppers inside their range', () => {
    const settings = defaultLeagueScoringSettings();
    settings.gameLength.maxInnings = 15;
    mockUseSettings.mockReturnValue({ data: { ...data().data, settings } });
    renderWithQuery(<ScoringScreen />);
    fireEvent.press(screen.getByLabelText('Increase Regulation innings'));
    expect(screen.getByLabelText('Regulation innings: 15')).toBeTruthy();
  });

  it('should show why a save was refused', async () => {
    mockSave.mockRejectedValue(new ApiError('invalid', 'Pick one of the pitch-count rulesets.'));
    renderWithQuery(<ScoringScreen />);
    fireEvent(screen.getByLabelText('Mercy rule'), 'valueChange', true);
    fireEvent.press(screen.getByText('Save settings'));
    expect(await screen.findByText('Pick one of the pitch-count rulesets.')).toBeTruthy();
  });

  it('should let a league manager read but not change them', () => {
    mockUseSettings.mockReturnValue(data(false));
    renderWithQuery(<ScoringScreen />);
    expect(screen.getByText(/League admins change these/)).toBeTruthy();
    expect(screen.queryByText('Save settings')).toBeNull();
    expect(screen.getByLabelText('Dual scorekeeper').props.disabled).toBe(true);
  });
});
