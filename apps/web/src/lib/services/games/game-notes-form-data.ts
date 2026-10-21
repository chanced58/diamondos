import type { GamePlayerAssessment, SaveGameNotesInput } from '@baseball/shared';

/** The web form's snake_case field suffixes, by assessment key. */
const CATEGORY_BY_FIELD = {
  pitching: 'pitching',
  hitting: 'hitting',
  fielding_catching: 'fieldingCatching',
  baserunning: 'baserunning',
  athleticism: 'athleticism',
  attitude: 'attitude',
} as const;

const EMPTY_ASSESSMENT: GamePlayerAssessment = {
  pitching: null,
  hitting: null,
  fieldingCatching: null,
  baserunning: null,
  athleticism: null,
  attitude: null,
};

/**
 * Reads `GameNotesForm`'s fields into the `saveGameNotes` input. Player
 * categories arrive as `player_<uuid>_<category>`; the form always posts
 * every field, so the overall and coach notes are always present.
 */
export function gameNotesInputFromFormData(formData: FormData): SaveGameNotesInput {
  const assessments = new Map<string, GamePlayerAssessment>();
  for (const [key, value] of formData.entries()) {
    const match = key.match(/^player_([0-9a-f-]{36})_(.+)$/);
    if (!match) continue;
    const [, playerId, field] = match;
    const category = CATEGORY_BY_FIELD[field as keyof typeof CATEGORY_BY_FIELD];
    if (!category) continue;
    const assessment = assessments.get(playerId) ?? { ...EMPTY_ASSESSMENT };
    assessment[category] = typeof value === 'string' ? value : null;
    assessments.set(playerId, assessment);
  }

  return {
    gameId: String(formData.get('gameId') ?? ''),
    overallNotes: String(formData.get('overall_notes') ?? ''),
    coachNotes: String(formData.get('coach_notes') ?? ''),
    players: [...assessments.entries()].map(([playerId, assessment]) => ({ playerId, assessment })),
  };
}
