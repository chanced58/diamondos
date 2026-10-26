import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { TRAINING_MODULES } from '@baseball/shared';
import { ApiError } from '../../../../../src/lib/api-client';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), replace: (...args: unknown[]) => mockReplace(...args) },
  useLocalSearchParams: () => mockParams(),
  Stack: { Screen: () => null },
}));
const mockUseProgress = jest.fn();
const mockComplete = jest.fn();
jest.mock('../../../../../src/features/training/training-api', () => ({
  ...jest.requireActual('../../../../../src/features/training/training-api'),
  useTrainingProgress: () => mockUseProgress(),
  completeTrainingModule: (...args: unknown[]) => mockComplete(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TrainingScreen = require('../index').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TrainingModuleScreen = require('../[slug]').default;

const [first, second] = TRAINING_MODULES;
const last = TRAINING_MODULES[TRAINING_MODULES.length - 1];
const progress = (completedSlugs: string[], isCertified = false) => ({ completedSlugs, isCertified, curriculumVersion: 1, offered: true });

/** Picks an option for every question of the module; `correct` picks the right one, otherwise a wrong one. */
function answerAll(module: (typeof TRAINING_MODULES)[number], correct: boolean) {
  const radios = screen.getAllByRole('radio');
  let offset = 0;
  for (const question of module.quiz) {
    const index = question.options.findIndex((option) => (option.id === question.correctOptionId) === correct);
    fireEvent.press(radios[offset + index]);
    offset += question.options.length;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({ slug: first.slug });
});

describe('TrainingScreen', () => {
  it('should list the modules with done marks and resume at the first unfinished one', () => {
    mockUseProgress.mockReturnValue({ data: progress([first.slug]) });
    renderWithQuery(<TrainingScreen />);

    expect(screen.getByText(`1 of ${TRAINING_MODULES.length} modules`)).toBeTruthy();
    expect(screen.getAllByText('Done')).toHaveLength(1);
    expect(screen.queryByText('Certified')).toBeNull();
    fireEvent.press(screen.getByText('Resume'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/training/[slug]', params: { slug: second.slug } });
  });

  it('should show the Certified badge once every module is done', () => {
    mockUseProgress.mockReturnValue({ data: progress(TRAINING_MODULES.map((m) => m.slug), true) });
    renderWithQuery(<TrainingScreen />);
    expect(screen.getByText('Certified')).toBeTruthy();
    expect(screen.getByText('All modules complete')).toBeTruthy();
    expect(screen.queryByText('Resume')).toBeNull();
  });

  it('should show the error with a retry when progress fails to load', () => {
    const refetch = jest.fn();
    mockUseProgress.mockReturnValue({ data: undefined, error: new ApiError('offline', 'Offline'), refetch });
    renderWithQuery(<TrainingScreen />);
    fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('TrainingModuleScreen', () => {
  it('should show the lessons and explain wrong answers without offering completion', () => {
    mockUseProgress.mockReturnValue({ data: progress([]) });
    renderWithQuery(<TrainingModuleScreen />);

    expect(screen.getByText(first.title)).toBeTruthy();
    answerAll(first, false);
    fireEvent.press(screen.getByText('Check answers'));
    expect(screen.getAllByText('Not quite')).toHaveLength(first.quiz.length);
    expect(screen.queryByText('Complete module')).toBeNull();
  });

  it('should complete the module once every answer is right and open the next one', async () => {
    mockUseProgress.mockReturnValue({ data: progress([]) });
    mockComplete.mockResolvedValue({ certifiedNow: false, nextSlug: second.slug, progress: progress([first.slug]) });
    renderWithQuery(<TrainingModuleScreen />);

    answerAll(first, true);
    fireEvent.press(screen.getByText('Check answers'));
    expect(screen.getAllByText('Correct')).toHaveLength(first.quiz.length);
    fireEvent.press(screen.getByText('Complete module'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({ pathname: '/(tabs)/more/training/[slug]', params: { slug: second.slug } }));
    expect(mockComplete).toHaveBeenCalledWith(first.slug);
  });

  it('should return to the list after the last module and say so when the coach is certified', async () => {
    mockParams.mockReturnValue({ slug: last.slug });
    mockUseProgress.mockReturnValue({ data: progress([]) });
    mockComplete.mockResolvedValue({ certifiedNow: true, nextSlug: null, progress: progress([last.slug], true) });
    renderWithQuery(<TrainingModuleScreen />);

    answerAll(last, true);
    fireEvent.press(screen.getByText('Check answers'));
    fireEvent.press(screen.getByText('Complete module'));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)/more/training'));
    expect(screen.getByText('Module complete — you are now DiamondOS Certified!')).toBeTruthy();
  });

  it('should show why completion failed', async () => {
    mockUseProgress.mockReturnValue({ data: progress([]) });
    mockComplete.mockRejectedValue(new ApiError('offline', 'Offline'));
    renderWithQuery(<TrainingModuleScreen />);

    answerAll(first, true);
    fireEvent.press(screen.getByText('Check answers'));
    fireEvent.press(screen.getByText('Complete module'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('should say so for a module not in the curriculum', () => {
    mockParams.mockReturnValue({ slug: 'nope' });
    mockUseProgress.mockReturnValue({ data: progress([]) });
    renderWithQuery(<TrainingModuleScreen />);
    expect(screen.getByText('Module not found')).toBeTruthy();
  });
});
