import { HitType } from '../../types/game-event';
import { extraBaseHitRunnerOptions } from '../runner-hold';

describe('extraBaseHitRunnerOptions', () => {
  describe('on a double', () => {
    it('should send a runner from first to third with no hold, because the batter takes second', () => {
      expect(extraBaseHitRunnerOptions(1, HitType.DOUBLE)).toEqual({ standardBase: 3, heldBase: null });
    });

    it('should score a runner from second, who can be held at third', () => {
      expect(extraBaseHitRunnerOptions(2, HitType.DOUBLE)).toEqual({ standardBase: 4, heldBase: 3 });
    });

    it('should score a runner from third with no hold', () => {
      expect(extraBaseHitRunnerOptions(3, HitType.DOUBLE)).toEqual({ standardBase: 4, heldBase: null });
    });
  });

  describe('on a triple', () => {
    it.each([1, 2, 3] as const)('should score a runner from base %i with no hold, because the batter takes third', (fromBase) => {
      expect(extraBaseHitRunnerOptions(fromBase, HitType.TRIPLE)).toEqual({ standardBase: 4, heldBase: null });
    });
  });

  it('should never offer a hold on the base the batter is taking', () => {
    expect(extraBaseHitRunnerOptions(1, HitType.DOUBLE)?.heldBase).not.toBe(2);
    for (const fromBase of [1, 2, 3] as const) {
      expect(extraBaseHitRunnerOptions(fromBase, HitType.TRIPLE)?.heldBase).not.toBe(3);
    }
  });

  it('should return null for hits that do not open the runner outcomes prompt', () => {
    expect(extraBaseHitRunnerOptions(1, HitType.SINGLE)).toBeNull();
    expect(extraBaseHitRunnerOptions(1, HitType.HOME_RUN)).toBeNull();
  });
});
