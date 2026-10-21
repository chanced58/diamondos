import {
  GAME_NOTE_CATEGORIES,
  type GameNoteCategory,
  type GameNotesResponse,
  type GamePlayerAssessment,
  type SaveGameNotesInput,
} from '@baseball/shared';

/** A coach's editable copy of a game's notes: plain strings, '' for none. */
export interface CoachNotesDraft {
  overallNotes: string;
  coachNotes: string;
  assessments: Record<string, Record<GameNoteCategory, string>>;
}

export type CoachNotesChanges = Omit<SaveGameNotesInput, 'gameId'>;

function assessmentDraft(assessment: GamePlayerAssessment): Record<GameNoteCategory, string> {
  return Object.fromEntries(
    GAME_NOTE_CATEGORIES.map(({ key }) => [key, assessment[key] ?? '']),
  ) as Record<GameNoteCategory, string>;
}

export function coachNotesDraftFrom(notes: GameNotesResponse): CoachNotesDraft {
  return {
    overallNotes: notes.overallNotes ?? '',
    coachNotes: notes.coachNotes ?? '',
    assessments: Object.fromEntries(notes.players.map((player) => [player.playerId, assessmentDraft(player.assessment)])),
  };
}

export function assessmentChanged(
  original: CoachNotesDraft,
  draft: CoachNotesDraft,
  playerId: string,
): boolean {
  const before = original.assessments[playerId];
  const after = draft.assessments[playerId];
  if (!before || !after) return false;
  return GAME_NOTE_CATEGORIES.some(({ key }) => before[key] !== after[key]);
}

/**
 * Only what the coach changed, for `PUT /games/:id/notes` — so a save never
 * overwrites a part someone else edited meanwhile. Null when nothing changed.
 */
export function coachNotesChanges(original: CoachNotesDraft, draft: CoachNotesDraft): CoachNotesChanges | null {
  const changes: CoachNotesChanges = {};
  if (draft.overallNotes !== original.overallNotes) changes.overallNotes = draft.overallNotes;
  if (draft.coachNotes !== original.coachNotes) changes.coachNotes = draft.coachNotes;

  const players = Object.keys(draft.assessments)
    .filter((playerId) => assessmentChanged(original, draft, playerId))
    .map((playerId) => {
      const values = draft.assessments[playerId];
      return {
        playerId,
        assessment: Object.fromEntries(
          GAME_NOTE_CATEGORIES.map(({ key }) => [key, values[key] === '' ? null : values[key]]),
        ) as GamePlayerAssessment,
      };
    });
  if (players.length > 0) changes.players = players;

  return Object.keys(changes).length > 0 ? changes : null;
}

/** The categories a coach filled in, in display order. */
export function filledCategories(assessment: GamePlayerAssessment): { label: string; value: string }[] {
  return GAME_NOTE_CATEGORIES.flatMap(({ key, label }) => {
    const value = assessment[key];
    return value && value.trim() !== '' ? [{ label, value }] : [];
  });
}
