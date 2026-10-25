import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { PracticeBlockType } from '@baseball/shared';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (...args: unknown[]) => mockReplace(...args) },
  Stack: { Screen: () => null },
}));
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => ({ activeTeam: { teamId: '11111111-1111-4111-8111-111111111111', isCoach: true } }) }));
jest.mock('../../../../../src/lib/web-links', () => ({ webUrl: () => null, openOnWeb: jest.fn() }));

const mockPreviewAi = jest.fn();
const mockCreateAi = jest.fn();
const mockUsePrep = jest.fn();
const mockCreatePrep = jest.fn();
const mockUseTemplates = jest.fn();
const mockDuplicate = jest.fn();
const mockArchive = jest.fn();
jest.mock('../../../../../src/features/practices/planning-api', () => ({
  previewAiPractice: (...args: unknown[]) => mockPreviewAi(...args),
  createAiPractice: (...args: unknown[]) => mockCreateAi(...args),
  usePrepPreview: (...args: unknown[]) => mockUsePrep(...args),
  createPrepPractice: (...args: unknown[]) => mockCreatePrep(...args),
  usePracticeTemplates: (...args: unknown[]) => mockUseTemplates(...args),
  duplicatePracticeTemplate: (...args: unknown[]) => mockDuplicate(...args),
  archivePracticeTemplate: (...args: unknown[]) => mockArchive(...args),
  practiceTemplatesQueryKey: (id: string) => ['teams', id, 'practice-templates'],
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const AiPracticeScreen = require('../ai').default;
const PrepPracticeScreen = require('../prep').default;
const PracticeTemplatesScreen = require('../templates').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const TEAM = '11111111-1111-4111-8111-111111111111';
const DRILL = '22222222-2222-4222-8222-222222222222';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => jest.clearAllMocks());

describe('AiPracticeScreen', () => {
  it('should draft a plan, show it, and save it for the chosen time', async () => {
    mockPreviewAi.mockResolvedValue({
      plan: {
        focusSummary: 'Defense first',
        blocks: [{ blockType: PracticeBlockType.TEAM_DEFENSE, title: 'Bunt coverage', plannedDurationMinutes: 20, drillId: DRILL, fieldSpaces: [], rationale: 'Two bunts beat us' }],
      },
      drillsById: { [DRILL]: 'Bunt D drill' },
      unknownDrillIds: ['x'],
      durationMismatchWarning: null,
    });
    mockCreateAi.mockResolvedValue({ practiceId: 'p1' });
    renderWithQuery(<AiPracticeScreen />);

    fireEvent.changeText(screen.getByLabelText('Practice focus'), 'Bunt defense and relays');
    await act(async () => {
      fireEvent.press(screen.getByText('Generate practice'));
      await settle();
    });
    expect(mockPreviewAi).toHaveBeenCalledWith(TEAM, expect.objectContaining({ coachPrompt: 'Bunt defense and relays', durationMinutes: 90, playerCount: 14 }));
    expect(screen.getByText('Defense first')).toBeTruthy();
    expect(screen.getByText(/Bunt D drill/)).toBeTruthy();
    expect(screen.getByText('1 suggested drill was not in your library and will be left out.')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByText('Save practice'));
      await settle();
    });
    expect(mockCreateAi).toHaveBeenCalledWith(TEAM, expect.objectContaining({ durationMinutes: 90, scheduledAt: expect.any(String) }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: 'p1' } }));
  });

  it('should stop a too-short description before calling the model', async () => {
    renderWithQuery(<AiPracticeScreen />);
    fireEvent.changeText(screen.getByLabelText('Practice focus'), 'bp');
    await act(async () => {
      fireEvent.press(screen.getByText('Generate practice'));
      await settle();
    });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(mockPreviewAi).not.toHaveBeenCalled();
  });
});

describe('PrepPracticeScreen', () => {
  const block = { position: 0, blockType: PracticeBlockType.SITUATIONAL, title: 'First-and-third D', plannedDurationMinutes: 25, rationale: 'They run', addressedDeficitIds: [], addressedTagValues: [] };

  it('should explain when there is no upcoming game', () => {
    mockUsePrep.mockReturnValue({ data: { nextGame: null, durationMinutes: 90, focusSummary: '', hasGaps: false, blocks: [], drillsById: {}, weaknessLabels: [], tendencyLabels: [] } });
    renderWithQuery(<PrepPracticeScreen />);
    expect(screen.getByText('No upcoming game')).toBeTruthy();
  });

  it('should save the suggested plan linked to the game', async () => {
    mockUsePrep.mockReturnValue({
      data: {
        nextGame: { id: 'g1', opponentName: 'Wolves', scheduledAt: '2099-01-10T01:00:00Z', timeZone: 'America/Boise' },
        durationMinutes: 90, focusSummary: 'Steal defense', hasGaps: true, blocks: [block], drillsById: {}, weaknessLabels: ['Missed signs'], tendencyLabels: ['Aggressive running'],
      },
    });
    mockCreatePrep.mockResolvedValue({ practiceId: 'p2' });
    renderWithQuery(<PrepPracticeScreen />);

    expect(screen.getByText('Steal defense')).toBeTruthy();
    expect(screen.getByText('Opponent: Aggressive running')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Save prep practice'));
      await settle();
    });
    expect(mockCreatePrep).toHaveBeenCalledWith(TEAM, expect.objectContaining({ linkedGameId: 'g1', durationMinutes: 90, prepFocusSummary: 'Steal defense', blocks: [block] }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: 'p2' } }));
  });
});

describe('PracticeTemplatesScreen', () => {
  const template = { id: 'tpl1', name: 'Tuesday', description: null, kind: 'weekly_recurring', seasonPhase: 'in_season', defaultDurationMinutes: 120, isIndoorFallback: false };

  it('should duplicate a template under the name typed', async () => {
    mockUseTemplates.mockReturnValue({ data: { teamId: 't1', templates: [template] } });
    mockDuplicate.mockResolvedValue({ templateId: 'copy' });
    renderWithQuery(<PracticeTemplatesScreen />);

    fireEvent.press(screen.getByLabelText('Duplicate Tuesday'));
    expect(screen.getByLabelText('Name for the copy').props.value).toBe('Tuesday (copy)');
    fireEvent.changeText(screen.getByLabelText('Name for the copy'), 'Thursday');
    await act(async () => {
      fireEvent.press(screen.getByText('Save copy'));
      await settle();
    });
    expect(mockDuplicate).toHaveBeenCalledWith('tpl1', 'Thursday');
  });

  it('should archive a template after confirming', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find((b) => b.text === 'Archive')?.onPress?.();
    });
    mockUseTemplates.mockReturnValue({ data: { teamId: 't1', templates: [template] } });
    mockArchive.mockResolvedValue({ templateId: 'tpl1' });
    renderWithQuery(<PracticeTemplatesScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Archive Tuesday'));
      await settle();
    });
    expect(mockArchive).toHaveBeenCalledWith('tpl1');
  });
});
