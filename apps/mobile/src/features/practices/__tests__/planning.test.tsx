import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithQuery } from '../../../__tests__/render-with-query';
import { aiPreviewRequest, defaultAiStart, defaultPrepStart } from '../planning-model';

const mockFetchSummary = jest.fn();
const mockGenerateSummary = jest.fn();
jest.mock('../planning-api', () => ({
  ...jest.requireActual('../planning-api'),
  fetchPracticeSummary: (...args: unknown[]) => mockFetchSummary(...args),
  generatePracticeSummary: (...args: unknown[]) => mockGenerateSummary(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SummaryCard } = require('../SummaryCard');

const TEAM = '11111111-1111-4111-8111-111111111111';
const SAM = '22222222-2222-4222-8222-222222222222';

beforeEach(() => jest.clearAllMocks());

describe('planning model', () => {
  it('should start an AI practice tomorrow at 4 PM, on the device clock', () => {
    expect(defaultAiStart(new Date(2026, 9, 25, 9, 30))).toEqual({ date: '2026-10-26', time: '16:00' });
  });

  it('should prep two days before the game at 3 PM, or tomorrow when that has passed', () => {
    const now = new Date(2026, 9, 25, 9, 0);
    expect(defaultPrepStart(new Date(2026, 9, 30, 18, 0).toISOString(), now)).toEqual({ date: '2026-10-28', time: '15:00' });
    expect(defaultPrepStart(new Date(2026, 9, 26, 18, 0).toISOString(), now)).toEqual({ date: '2026-10-26', time: '15:00' });
  });

  it('should explain a bad AI request before it is sent', () => {
    const values = { prompt: 'Bunt defense and relays', duration: '90', players: '14', fieldSpaces: [] };
    expect(aiPreviewRequest(TEAM, values)).toMatchObject({ input: { durationMinutes: 90, playerCount: 14 } });
    expect(aiPreviewRequest(TEAM, { ...values, prompt: 'bp' })).toEqual({
      problem: 'Describe what you want the practice to focus on (at least a sentence).',
    });
    expect(aiPreviewRequest(TEAM, { ...values, duration: '300' })).toEqual({ problem: 'Duration must be between 15 and 240 minutes.' });
    expect(aiPreviewRequest(TEAM, { ...values, players: 'ten' })).toEqual({ problem: 'Player count must be between 1 and 50.' });
  });
});

describe('SummaryCard', () => {
  const players = [{ id: SAM, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 }];
  const summary = {
    id: 's1', practiceId: 'p1', teamId: TEAM, model: 'sonnet', generatedAt: '2026-10-25T23:00:00Z',
    coachRecap: 'Crisp practice.', standoutPlayers: [{ playerId: SAM, reason: 'Barreled everything' }],
    concerns: [{ playerId: null, note: 'Bunt coverage lagged' }], playerSummaries: { [SAM]: 'Locked in.' },
  };

  it('should offer to generate a summary, and show it with player names', async () => {
    mockFetchSummary.mockResolvedValue({ summary: null });
    mockGenerateSummary.mockResolvedValue({ summary });
    renderWithQuery(<SummaryCard practiceId="p1" players={players} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      fireEvent.press(screen.getByText('Generate summary'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockGenerateSummary).toHaveBeenCalledWith('p1');
    expect(screen.getByText('Crisp practice.')).toBeTruthy();
    expect(screen.getByText('Sam Lee')).toBeTruthy();
    expect(screen.getByText('Bunt coverage lagged')).toBeTruthy();
    expect(screen.getByText('Regenerate summary')).toBeTruthy();

    fireEvent.press(screen.getByText('Show each player (1)'));
    expect(screen.getByText(/Locked in\./)).toBeTruthy();
  });
});
