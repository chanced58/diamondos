import type { GameLineup } from '../../types/game';
import type { HotHitter } from '../../types/hot-hitters';
import { suggestLineupAdjustment } from '../lineup-adjustment';

function slot(battingOrder: number, playerId: string): GameLineup {
  return {
    id: `l-${battingOrder}`,
    gameId: 'g-1',
    playerId,
    battingOrder,
    isStarter: true,
    createdAt: '2026-04-22T00:00:00Z',
  };
}

function hot(playerId: string, rank: number): HotHitter {
  return {
    playerId,
    rank,
    score: 0.8,
    evidence: {
      totalReps: 10,
      hitHard: 6,
      lineDrives: 2,
      weakContact: 1,
      swingAndMisses: 1,
      coachTaggedHot: 3,
      coachTaggedCold: 0,
    },
  };
}

function cold(playerId: string, rank: number): HotHitter {
  return {
    playerId,
    rank,
    score: 0.6,
    evidence: {
      totalReps: 10,
      hitHard: 0,
      lineDrives: 1,
      weakContact: 3,
      swingAndMisses: 5,
      coachTaggedHot: 0,
      coachTaggedCold: 2,
    },
  };
}

describe('suggestLineupAdjustment', () => {
  it('proposes a swap when a top-slot starter is cold and a non-top starter is hot', () => {
    const lineup = [
      slot(1, 'a'),
      slot(2, 'b'),
      slot(3, 'c-cold'),
      slot(4, 'd'),
      slot(5, 'e'),
      slot(6, 'f-hot'),
      slot(7, 'g'),
      slot(8, 'h'),
      slot(9, 'i'),
    ];
    const suggestions = suggestLineupAdjustment({
      currentLineup: lineup,
      hotHitters: [hot('f-hot', 1)],
      coldHitters: [cold('c-cold', 1)],
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      demotePlayerId: 'c-cold',
      promotePlayerId: 'f-hot',
      toBattingOrder: 3,
      fromBattingOrder: 6,
    });
  });

  it('returns empty when no cold hitter is in the top slots', () => {
    const lineup = [slot(1, 'a'), slot(2, 'b'), slot(3, 'c'), slot(4, 'd'), slot(5, 'e'), slot(6, 'f')];
    const suggestions = suggestLineupAdjustment({
      currentLineup: lineup,
      hotHitters: [hot('f', 1)],
      coldHitters: [cold('z-not-a-starter', 1)],
    });
    expect(suggestions).toEqual([]);
  });

  it('returns empty when no hot hitter is available outside the top slots', () => {
    const lineup = [slot(1, 'a'), slot(2, 'b'), slot(3, 'c-cold'), slot(4, 'd'), slot(5, 'e-hot')];
    const suggestions = suggestLineupAdjustment({
      currentLineup: lineup,
      hotHitters: [hot('e-hot', 1)], // already in top slots
      coldHitters: [cold('c-cold', 1)],
    });
    expect(suggestions).toEqual([]);
  });

  it('caps suggestions at maxSwaps', () => {
    const lineup = [
      slot(1, 'cold-1'),
      slot(2, 'cold-2'),
      slot(3, 'cold-3'),
      slot(4, 'ok-1'),
      slot(5, 'ok-2'),
      slot(6, 'hot-1'),
      slot(7, 'hot-2'),
      slot(8, 'hot-3'),
    ];
    const suggestions = suggestLineupAdjustment({
      currentLineup: lineup,
      hotHitters: [hot('hot-1', 1), hot('hot-2', 2), hot('hot-3', 3)],
      coldHitters: [cold('cold-1', 1), cold('cold-2', 2), cold('cold-3', 3)],
      maxSwaps: 2,
    });
    expect(suggestions).toHaveLength(2);
  });

  it('ignores non-starters', () => {
    const lineup = [
      slot(1, 'a'),
      slot(2, 'b'),
      { ...slot(3, 'bench'), isStarter: false },
    ];
    const suggestions = suggestLineupAdjustment({
      currentLineup: lineup,
      hotHitters: [hot('bench', 1)],
      coldHitters: [cold('a', 1)],
    });
    expect(suggestions).toEqual([]);
  });
});
