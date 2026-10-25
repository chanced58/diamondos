import type { PracticeDetailResponse, PracticeRunBlock, PracticeSummary } from '@baseball/shared';
import { splitPractices } from '../practice-format';
import { practiceInput, validatePracticeForm } from '../practice-form-model';
import { filledCount, notesDraftFrom, notesInput } from '../notes-draft';
import { actualMinutes, allBlocksDone, currentBlock, nextPendingAfter, timerTone } from '../runner-model';

const TEAM = '11111111-1111-4111-8111-111111111111';

describe('splitPractices', () => {
  const at = (id: string, iso: string): PracticeSummary => ({ id, scheduledAt: iso, durationMinutes: null, location: null, runStatus: 'not_started', isPrep: false });

  it("should put today's and later practices first, soonest first, and earlier ones latest first", () => {
    const now = new Date(2026, 9, 25, 12, 0);
    const { upcoming, past } = splitPractices(
      [
        at('later', new Date(2026, 9, 27, 16).toISOString()),
        at('this-morning', new Date(2026, 9, 25, 8).toISOString()),
        at('last-week', new Date(2026, 9, 18, 16).toISOString()),
        at('yesterday', new Date(2026, 9, 24, 16).toISOString()),
      ],
      now,
    );
    expect(upcoming.map((p) => p.id)).toEqual(['this-morning', 'later']);
    expect(past.map((p) => p.id)).toEqual(['yesterday', 'last-week']);
  });
});

describe('practice form', () => {
  const values = { date: '2026-10-25', time: '16:00', duration: '90', venue: null, notifyTeam: true };

  it('should send the local wall clock as an instant, with the zone for the announcement', () => {
    expect(practiceInput(TEAM, values, 'America/Boise')).toEqual({
      teamId: TEAM,
      scheduledAt: new Date(2026, 9, 25, 16, 0).toISOString(),
      durationMinutes: 90,
      location: null,
      address: null,
      latitude: null,
      longitude: null,
      placeId: null,
      timeZone: 'America/Boise',
      notifyTeam: true,
    });
    expect(practiceInput(TEAM, { ...values, duration: ' ' }, null).durationMinutes).toBeNull();
  });

  it('should explain a bad duration', () => {
    expect(validatePracticeForm(TEAM, values)).toBeNull();
    expect(validatePracticeForm(TEAM, { ...values, duration: '1.5' })).toBe('Duration must be a whole number of minutes.');
    expect(validatePracticeForm(TEAM, { ...values, duration: '900' })).toBe('Duration must be between 1 and 600 minutes.');
  });
});

describe('notes draft', () => {
  const detail = {
    overallNotes: 'Good day',
    coach: {
      coachNotes: null,
      players: [
        { id: 'p1', firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 },
        { id: 'p2', firstName: 'Ann', lastName: 'Coit', jerseyNumber: null },
      ],
      playerNotes: {
        p1: { pitching: null, hitting: 'Stay back', fielding_catching: null, baserunning: null, athleticism: null, attitude: null, playerNotes: 'Mine' },
      },
      hitters: { totalReps: 0, hot: [], cold: [] },
    },
  } as unknown as PracticeDetailResponse;

  it('should send only the players whose notes changed', () => {
    const original = notesDraftFrom(detail);
    expect(original.players.p1.hitting).toBe('Stay back');
    expect(filledCount(original.players.p1)).toBe(1);

    const edited = { ...original, coachNotes: 'Watch p2', players: { ...original.players, p2: { ...original.players.p2, attitude: 'Great' } } };
    expect(notesInput(original, edited)).toEqual({
      overallNotes: 'Good day',
      coachNotes: 'Watch p2',
      players: [{ playerId: 'p2', pitching: '', hitting: '', fielding_catching: '', baserunning: '', athleticism: '', attitude: 'Great' }],
    });
  });
});

describe('runner model', () => {
  const block = (id: string, position: number, status: string, startedAt: string | null = null): PracticeRunBlock => ({
    id, position, status, startedAt, blockType: 'warmup', title: id, plannedDurationMinutes: 10, actualDurationMinutes: null,
    completedAt: null, notes: null, canControl: true,
  });

  it('should show the active block, else the first pending, and find the next pending after it', () => {
    const blocks = [block('a', 1, 'completed'), block('b', 2, 'active'), block('c', 3, 'skipped'), block('d', 4, 'pending')];
    expect(currentBlock(blocks)?.id).toBe('b');
    expect(nextPendingAfter(blocks, 2)?.id).toBe('d');
    expect(currentBlock([block('a', 1, 'completed'), block('d', 4, 'pending')])?.id).toBe('d');
    expect(allBlocksDone(blocks)).toBe(false);
    expect(allBlocksDone([block('a', 1, 'completed'), block('c', 3, 'skipped')])).toBe(true);
  });

  it('should count at least a minute, and color the countdown by time left', () => {
    const started = new Date('2026-10-25T16:00:00Z');
    expect(actualMinutes(block('b', 2, 'active', started.toISOString()), new Date('2026-10-25T16:00:20Z'))).toBe(1);
    expect(actualMinutes(block('b', 2, 'active', started.toISOString()), new Date('2026-10-25T16:12:40Z'))).toBe(13);
    expect(timerTone({ elapsedSeconds: 60, remainingSeconds: 540, overrunSeconds: 0, plannedSeconds: 600 })).toBe('good');
    expect(timerTone({ elapsedSeconds: 400, remainingSeconds: 200, overrunSeconds: 0, plannedSeconds: 600 })).toBe('warn');
    expect(timerTone({ elapsedSeconds: 660, remainingSeconds: 0, overrunSeconds: 60, plannedSeconds: 600 })).toBe('over');
  });
});
