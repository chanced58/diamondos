import {
  PRACTICE_NOTE_CATEGORIES,
  type PracticeDetailResponse,
  type PracticeNoteCategory,
  type SavePracticeNotesInput,
} from '@baseball/shared';

/**
 * The coach notes form's draft: overall and coach notes plus each player's
 * category notes, as strings. Saving sends only the players whose notes
 * changed, so another coach's edits to other players are left alone.
 */

export type CategoryDraft = Record<PracticeNoteCategory, string>;

export interface NotesDraft {
  overallNotes: string;
  coachNotes: string;
  players: Record<string, CategoryDraft>;
}

const emptyCategories = (): CategoryDraft =>
  Object.fromEntries(PRACTICE_NOTE_CATEGORIES.map(({ key }) => [key, ''])) as CategoryDraft;

/** The form's starting values from the practice: every roster player, blank where nothing is written. */
export function notesDraftFrom(detail: PracticeDetailResponse): NotesDraft {
  const coach = detail.coach;
  const players: Record<string, CategoryDraft> = {};
  for (const player of coach?.players ?? []) {
    const saved = coach?.playerNotes[player.id];
    const draft = emptyCategories();
    for (const { key } of PRACTICE_NOTE_CATEGORIES) draft[key] = saved?.[key] ?? '';
    players[player.id] = draft;
  }
  return { overallNotes: detail.overallNotes ?? '', coachNotes: coach?.coachNotes ?? '', players };
}

/** The save request: overall and coach notes only when edited, and only the players whose notes changed. */
export function notesInput(original: NotesDraft, draft: NotesDraft): Omit<SavePracticeNotesInput, 'practiceId'> {
  const changed = Object.entries(draft.players).filter(([playerId, notes]) =>
    PRACTICE_NOTE_CATEGORIES.some(({ key }) => notes[key] !== original.players[playerId]?.[key]),
  );
  // Overall and coach notes go only when edited here, like players' notes.
  return {
    ...(draft.overallNotes !== original.overallNotes && { overallNotes: draft.overallNotes }),
    ...(draft.coachNotes !== original.coachNotes && { coachNotes: draft.coachNotes }),
    players: changed.map(([playerId, notes]) => ({ playerId, ...notes })),
  };
}

/** How many categories have something written. */
export function filledCount(notes: CategoryDraft | undefined): number {
  return PRACTICE_NOTE_CATEGORIES.filter(({ key }) => (notes?.[key] ?? '').trim().length > 0).length;
}
