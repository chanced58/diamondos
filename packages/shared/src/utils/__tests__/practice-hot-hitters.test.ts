import {
  PracticeRepCoachTag,
  PracticeRepOutcomeCategory,
  type PracticeRep,
} from '../../types/practice-rep';
import { identifyColdHitters, rankHotHitters } from '../practice-hot-hitters';

let seq = 0;

function rep(
  overrides: Partial<PracticeRep> & { playerId: string; outcome: string },
): PracticeRep {
  seq += 1;
  return {
    id: `rep-${seq}`,
    practiceId: 'pr-1',
    outcomeCategory: PracticeRepOutcomeCategory.NEUTRAL,
    metrics: {},
    recordedAt: '2026-04-22T18:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  seq = 0;
});

describe('rankHotHitters', () => {
  const now = new Date('2026-04-22T20:00:00Z');

  it('ranks players with more hit-hard reps higher', () => {
    const reps: PracticeRep[] = [
      ...Array.from({ length: 5 }, () => rep({ playerId: 'cold', outcome: 'swing_miss' })),
      ...Array.from({ length: 5 }, () => rep({ playerId: 'hot', outcome: 'hit_hard' })),
    ];
    const ranked = rankHotHitters(reps, { now });
    expect(ranked[0].playerId).toBe('hot');
    expect(ranked[ranked.length - 1].playerId).toBe('cold');
  });

  it('filters out players below the minimum rep threshold', () => {
    const reps: PracticeRep[] = [
      rep({ playerId: 'below', outcome: 'hit_hard' }),
      rep({ playerId: 'below', outcome: 'hit_hard' }),
      ...Array.from({ length: 5 }, () => rep({ playerId: 'above', outcome: 'hit_hard' })),
    ];
    const ranked = rankHotHitters(reps, { now });
    expect(ranked.map((r) => r.playerId)).toEqual(['above']);
  });

  it('ignores reps outside the lookback window', () => {
    const reps: PracticeRep[] = [
      ...Array.from({ length: 5 }, () =>
        rep({
          playerId: 'old-hot',
          outcome: 'hit_hard',
          recordedAt: '2026-04-10T18:00:00Z', // 12 days before "now"
        }),
      ),
      ...Array.from({ length: 5 }, () =>
        rep({ playerId: 'recent', outcome: 'line_drive' }),
      ),
    ];
    const ranked = rankHotHitters(reps, { now });
    expect(ranked.map((r) => r.playerId)).toEqual(['recent']);
  });

  it('weights coach-tagged hot reps positively', () => {
    const reps: PracticeRep[] = [
      ...Array.from({ length: 5 }, () =>
        rep({ playerId: 'baseline', outcome: 'line_drive' }),
      ),
      ...Array.from({ length: 5 }, () =>
        rep({
          playerId: 'tagged',
          outcome: 'line_drive',
          coachTag: PracticeRepCoachTag.HOT,
        }),
      ),
    ];
    const ranked = rankHotHitters(reps, { now });
    expect(ranked[0].playerId).toBe('tagged');
  });

  it('assigns sequential ranks', () => {
    const reps: PracticeRep[] = [
      ...Array.from({ length: 5 }, () => rep({ playerId: 'a', outcome: 'hit_hard' })),
      ...Array.from({ length: 5 }, () => rep({ playerId: 'b', outcome: 'line_drive' })),
      ...Array.from({ length: 5 }, () => rep({ playerId: 'c', outcome: 'weak_contact' })),
    ];
    const ranked = rankHotHitters(reps, { now });
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
});

describe('identifyColdHitters', () => {
  const now = new Date('2026-04-22T20:00:00Z');

  it('surfaces players with net-negative rep profiles', () => {
    const reps: PracticeRep[] = [
      ...Array.from({ length: 5 }, () => rep({ playerId: 'cold', outcome: 'swing_miss' })),
      ...Array.from({ length: 5 }, () => rep({ playerId: 'hot', outcome: 'hit_hard' })),
    ];
    const cold = identifyColdHitters(reps, { now });
    expect(cold.map((r) => r.playerId)).toEqual(['cold']);
  });

  it('returns empty when everyone is hot', () => {
    const reps: PracticeRep[] = [
      ...Array.from({ length: 5 }, () => rep({ playerId: 'a', outcome: 'hit_hard' })),
      ...Array.from({ length: 5 }, () => rep({ playerId: 'b', outcome: 'line_drive' })),
    ];
    expect(identifyColdHitters(reps, { now })).toEqual([]);
  });
});
