import { TRAINING_MODULES, type QuizQuestion } from '@baseball/shared';
import { allAnswered, allRight, gradeQuiz, progressLabel, totalMinutes } from '../quiz-model';
import { completeTrainingModule, fetchTrainingProgress } from '../training-api';
import type { ApiClient } from '../../../lib/api-client';

const quiz: QuizQuestion[] = [
  { id: 'q1', prompt: 'One?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionId: 'a', explanation: 'A.' },
  { id: 'q2', prompt: 'Two?', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctOptionId: 'b', explanation: 'B.' },
];

describe('quiz model', () => {
  it('should grade each question right, wrong or unanswered', () => {
    expect(gradeQuiz(quiz, { q1: 'a', q2: 'a' })).toEqual({ q1: 'right', q2: 'wrong' });
    expect(gradeQuiz(quiz, { q1: 'b' })).toEqual({ q1: 'wrong', q2: 'unanswered' });
  });

  it('should need every question answered before checking, and every one right to complete', () => {
    expect(allAnswered(quiz, { q1: 'a' })).toBe(false);
    expect(allAnswered(quiz, { q1: 'a', q2: 'a' })).toBe(true);
    expect(allRight(gradeQuiz(quiz, { q1: 'a', q2: 'a' }), quiz)).toBe(false);
    expect(allRight(gradeQuiz(quiz, { q1: 'a', q2: 'b' }), quiz)).toBe(true);
    expect(allRight({}, [])).toBe(false);
  });

  it('should count only current modules toward progress and add up the curriculum time', () => {
    const [first, second] = TRAINING_MODULES;
    expect(progressLabel([first.slug, second.slug, 'retired-module'])).toBe(`2 of ${TRAINING_MODULES.length} modules`);
    expect(progressLabel([])).toBe(`0 of ${TRAINING_MODULES.length} modules`);
    expect(totalMinutes()).toBe(TRAINING_MODULES.reduce((sum, m) => sum + m.estimatedMinutes, 0));
  });
});

describe('training api', () => {
  it('should read progress and post a completion for the module in the path', async () => {
    const client = { get: jest.fn().mockResolvedValue('progress'), post: jest.fn().mockResolvedValue('done') } as unknown as ApiClient;
    await expect(fetchTrainingProgress(client)).resolves.toBe('progress');
    expect(client.get).toHaveBeenCalledWith('/training', expect.anything());
    await expect(completeTrainingModule('a b', client)).resolves.toBe('done');
    expect(client.post).toHaveBeenCalledWith('/training/a%20b/complete', {}, expect.anything());
  });
});
