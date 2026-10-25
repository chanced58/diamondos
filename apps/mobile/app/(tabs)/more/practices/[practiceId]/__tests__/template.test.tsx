import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../../src/__tests__/render-with-query';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { back: () => mockBack() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ practiceId: 'p1' }),
}));
jest.mock('../../../../../../src/providers/RoleProvider', () => ({ useRole: () => ({ activeTeam: { teamId: 't1' } }) }));
const mockUseTemplates = jest.fn();
const mockApply = jest.fn();
jest.mock('../../../../../../src/features/practices/planning-api', () => ({
  usePracticeTemplates: (...args: unknown[]) => mockUseTemplates(...args),
  applyPracticeTemplate: (...args: unknown[]) => mockApply(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ApplyTemplateScreen = require('../template').default;

beforeEach(() => jest.clearAllMocks());

describe('ApplyTemplateScreen', () => {
  it("should replace the practice's blocks with the chosen template after confirming", async () => {
    mockUseTemplates.mockReturnValue({
      data: { teamId: 't1', templates: [{ id: 'tpl1', name: 'Tuesday', description: null, kind: 'weekly_recurring', seasonPhase: 'in_season', defaultDurationMinutes: 120, isIndoorFallback: false }] },
    });
    mockApply.mockResolvedValue({ practiceId: 'p1' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'Replace blocks')?.onPress?.();
    });
    renderWithQuery(<ApplyTemplateScreen />);

    await act(async () => {
      fireEvent.press(screen.getByText('Tuesday'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(alert).toHaveBeenCalledWith('Use Tuesday?', "Its blocks replace this practice's blocks.", expect.any(Array));
    expect(mockApply).toHaveBeenCalledWith('p1', 'tpl1');
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
