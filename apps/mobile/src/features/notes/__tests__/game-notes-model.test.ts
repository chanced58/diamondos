import type { GameNotesResponse } from '@baseball/shared';
import { coachNotesChanges, coachNotesDraftFrom, filledCategories } from '../game-notes-model';

const empty = { pitching: null, hitting: null, fieldingCatching: null, baserunning: null, athleticism: null, attitude: null };

const notes: GameNotesResponse = {
  gameId: 'g1',
  view: 'coach',
  overallNotes: 'Windy day',
  coachNotes: null,
  players: [
    { playerId: 'a', name: 'Ada Abbott', jerseyNumber: 4, assessment: { ...empty, hitting: 'Quick hands' }, selfNotes: null, canEditSelfNotes: false },
    { playerId: 'b', name: 'Bo Burke', jerseyNumber: null, assessment: empty, selfNotes: 'Felt good', canEditSelfNotes: false },
  ],
};

describe('coachNotesChanges', () => {
  it('should report nothing when nothing was edited', () => {
    const draft = coachNotesDraftFrom(notes);
    expect(draft.coachNotes).toBe('');
    expect(coachNotesChanges(draft, coachNotesDraftFrom(notes))).toBeNull();
  });

  it('should send only the edited parts and only the edited players', () => {
    const original = coachNotesDraftFrom(notes);
    const draft = {
      ...original,
      coachNotes: 'Work on bunts',
      assessments: { ...original.assessments, a: { ...original.assessments.a, hitting: '', attitude: 'Great energy' } },
    };

    expect(coachNotesChanges(original, draft)).toEqual({
      coachNotes: 'Work on bunts',
      players: [{ playerId: 'a', assessment: { ...empty, attitude: 'Great energy' } }],
    });
  });

  it('should count edits for a player who joined after the form opened', () => {
    const original = coachNotesDraftFrom(notes);
    const draft = { ...original, assessments: { ...original.assessments, c: { attitude: 'Hustles' } as never } };
    expect(coachNotesChanges(original, draft)).toEqual({
      players: [{ playerId: 'c', assessment: { ...empty, attitude: 'Hustles' } }],
    });
  });

  it('should treat typing back the original text as no change', () => {
    const original = coachNotesDraftFrom(notes);
    const draft = { ...original, overallNotes: 'Windy day' };
    expect(coachNotesChanges(original, draft)).toBeNull();
  });
});

describe('filledCategories', () => {
  it('should list only the categories the coach filled, in display order', () => {
    expect(filledCategories({ ...empty, attitude: 'Great', pitching: 'Sharp', hitting: '  ' })).toEqual([
      { label: 'Pitching/Throwing', value: 'Sharp' },
      { label: 'Attitude', value: 'Great' },
    ]);
  });
});
