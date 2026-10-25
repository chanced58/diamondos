import { aiPracticePreviewInputSchema, type AiPracticePreviewInput, type PracticeFieldSpace } from '@baseball/shared';
import { partsFromLocalDate } from '../forms/date-parts';

/**
 * Defaults and checks for the practice-planning screens, on the device's own
 * clock (the instant is what the server stores).
 */

/** Tomorrow at 4:00 PM, for an AI practice's start. */
export function defaultAiStart(now: Date = new Date()): { date: string; time: string } {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 16, 0);
  return partsFromLocalDate(tomorrow);
}

/**
 * A prep practice's start: two days before the game at 3:00 PM, or tomorrow
 * at 3:00 PM when that has already passed (the web page's rule).
 */
export function defaultPrepStart(gameIso: string, now: Date = new Date()): { date: string; time: string } {
  const game = new Date(gameIso);
  const target = new Date(game.getFullYear(), game.getMonth(), game.getDate() - 2, 15, 0);
  if (target.getTime() >= now.getTime()) return partsFromLocalDate(target);
  return partsFromLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 15, 0));
}

export interface AiFormValues {
  prompt: string;
  duration: string;
  players: string;
  fieldSpaces: PracticeFieldSpace[];
}

/** The preview request, or the first problem the server would report. */
export function aiPreviewRequest(teamId: string, values: AiFormValues): { input: AiPracticePreviewInput } | { problem: string } {
  const whole = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);
  const input = {
    teamId,
    coachPrompt: values.prompt,
    durationMinutes: whole(values.duration),
    playerCount: whole(values.players),
    availableFieldSpaces: values.fieldSpaces,
  };
  const parsed = aiPracticePreviewInputSchema.safeParse(input);
  if (parsed.success) return { input };
  const issue = parsed.error.issues[0];
  if (issue?.path[0] === 'durationMinutes') return { problem: 'Duration must be between 15 and 240 minutes.' };
  if (issue?.path[0] === 'playerCount') return { problem: 'Player count must be between 1 and 50.' };
  return { problem: issue?.message ?? 'Check the details.' };
}
