import { TRAINING_MODULES, type QuizQuestion, type TrainingModule } from '@baseball/shared';

/** A module's quiz as the web grades it: every question answered and right completes the module. */

export type QuizResult = 'unanswered' | 'right' | 'wrong';

/** Each question's result for the chosen answers (question id → option id). */
export function gradeQuiz(quiz: readonly QuizQuestion[], answers: Readonly<Record<string, string>>): Record<string, QuizResult> {
  return Object.fromEntries(
    quiz.map((q) => {
      const answer = answers[q.id];
      return [q.id, answer == null ? 'unanswered' : answer === q.correctOptionId ? 'right' : 'wrong'];
    }),
  );
}

/** Whether every question has an answer. */
export function allAnswered(quiz: readonly QuizQuestion[], answers: Readonly<Record<string, string>>): boolean {
  return quiz.every((q) => Boolean(answers[q.id]));
}

/** Whether every question is right (the module can be completed). */
export function allRight(results: Readonly<Record<string, QuizResult>>, quiz: readonly QuizQuestion[]): boolean {
  return quiz.length > 0 && quiz.every((q) => results[q.id] === 'right');
}

/** "2 of 5 modules" over the current curriculum, ignoring completions of retired modules. */
export function progressLabel(completedSlugs: readonly string[], modules: readonly TrainingModule[] = TRAINING_MODULES): string {
  const done = modules.filter((m) => completedSlugs.includes(m.slug)).length;
  return `${done} of ${modules.length} modules`;
}

/** Total minutes across the curriculum. */
export function totalMinutes(modules: readonly TrainingModule[] = TRAINING_MODULES): number {
  return modules.reduce((sum, m) => sum + m.estimatedMinutes, 0);
}

/** Roles offered training, as the web sidebar decides (cosmetic: the server says so too). */
export const TRAINING_ROLES: readonly string[] = ['head_coach', 'assistant_coach', 'scorekeeper', 'staff', 'athletic_director'];
