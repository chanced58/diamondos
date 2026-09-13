import { HitType } from '../../types/game-event';
import { evaluateHitRunnerOutcomes, hitRunnerOptions } from '../hit-runner-outcomes';

describe('hitRunnerOptions', () => {
  describe('on a single', () => {
    it('should move a runner from first to second, with third or home as advances', () => {
      expect(hitRunnerOptions(1, HitType.SINGLE)).toEqual({ standardBase: 2, heldBase: null, advancedBases: [3, 4] });
    });

    it('should move a runner from second to third, with home as the advance', () => {
      expect(hitRunnerOptions(2, HitType.SINGLE)).toEqual({ standardBase: 3, heldBase: null, advancedBases: [4] });
    });

    it('should score a runner from third with nothing beyond it', () => {
      expect(hitRunnerOptions(3, HitType.SINGLE)).toEqual({ standardBase: 4, heldBase: null, advancedBases: [] });
    });
  });

  describe('on a double', () => {
    it('should send a runner from first to third with no hold, because the batter takes second', () => {
      expect(hitRunnerOptions(1, HitType.DOUBLE)).toEqual({ standardBase: 3, heldBase: null, advancedBases: [4] });
    });

    it('should score a runner from second, who can be held at third', () => {
      expect(hitRunnerOptions(2, HitType.DOUBLE)).toEqual({ standardBase: 4, heldBase: 3, advancedBases: [] });
    });

    it('should score a runner from third with no hold', () => {
      expect(hitRunnerOptions(3, HitType.DOUBLE)).toEqual({ standardBase: 4, heldBase: null, advancedBases: [] });
    });
  });

  describe('on a triple', () => {
    it.each([1, 2, 3] as const)('should score a runner from base %i with no hold, because the batter takes third', (fromBase) => {
      expect(hitRunnerOptions(fromBase, HitType.TRIPLE)).toEqual({ standardBase: 4, heldBase: null, advancedBases: [] });
    });
  });

  it('should never offer a hold on the base the batter is taking', () => {
    expect(hitRunnerOptions(1, HitType.DOUBLE)?.heldBase).not.toBe(2);
    for (const fromBase of [1, 2, 3] as const) {
      expect(hitRunnerOptions(fromBase, HitType.TRIPLE)?.heldBase).not.toBe(3);
    }
  });

  it('should return null for a home run, which clears the bases', () => {
    expect(hitRunnerOptions(1, HitType.HOME_RUN)).toBeNull();
  });
});

describe('evaluateHitRunnerOutcomes', () => {
  it('should accept the standard advance and count the runs it drives in', () => {
    expect(
      evaluateHitRunnerOutcomes(HitType.SINGLE, [
        { fromBase: 1, choice: { kind: 'auto' } },
        { fromBase: 3, choice: { kind: 'auto' } },
      ]),
    ).toEqual({ error: null, rbis: 1 });
  });

  it('should credit the RBI when a runner from second scores on a single', () => {
    expect(
      evaluateHitRunnerOutcomes(HitType.SINGLE, [{ fromBase: 2, choice: { kind: 'advanced', toBase: 4 } }]),
    ).toEqual({ error: null, rbis: 1 });
  });

  it('should drive in no run for a runner held at third on a double', () => {
    expect(
      evaluateHitRunnerOutcomes(HitType.DOUBLE, [{ fromBase: 2, choice: { kind: 'held', toBase: 3 } }]),
    ).toEqual({ error: null, rbis: 0 });
  });

  it('should drive in no run for a runner thrown out', () => {
    expect(
      evaluateHitRunnerOutcomes(HitType.SINGLE, [{ fromBase: 3, choice: { kind: 'thrown_out' } }]),
    ).toEqual({ error: null, rbis: 0 });
  });

  it('should reject two runners finishing on the same base', () => {
    // Runner from second held at third on a double; runner from first takes
    // the standard third. Somebody has to be out or score.
    const result = evaluateHitRunnerOutcomes(HitType.DOUBLE, [
      { fromBase: 1, choice: { kind: 'auto' } },
      { fromBase: 2, choice: { kind: 'held', toBase: 3 } },
    ]);
    expect(result.error).toBe("Two runners can't both finish on 3B.");
  });

  it('should reject a runner scoring past a lead runner who stopped at third', () => {
    const result = evaluateHitRunnerOutcomes(HitType.SINGLE, [
      { fromBase: 1, choice: { kind: 'advanced', toBase: 4 } },
      { fromBase: 2, choice: { kind: 'auto' } },
    ]);
    expect(result.error).toBe("The runner from 1B can't pass the runner from 2B.");
  });

  it('should allow a trailing runner to go further once the lead runner is thrown out', () => {
    expect(
      evaluateHitRunnerOutcomes(HitType.SINGLE, [
        { fromBase: 1, choice: { kind: 'advanced', toBase: 3 } },
        { fromBase: 2, choice: { kind: 'thrown_out' } },
      ]),
    ).toEqual({ error: null, rbis: 0 });
  });

  it('should allow two runners to both score', () => {
    expect(
      evaluateHitRunnerOutcomes(HitType.SINGLE, [
        { fromBase: 1, choice: { kind: 'advanced', toBase: 4 } },
        { fromBase: 2, choice: { kind: 'advanced', toBase: 4 } },
      ]),
    ).toEqual({ error: null, rbis: 2 });
  });

  it('should reject a hold the hit does not allow', () => {
    const result = evaluateHitRunnerOutcomes(HitType.DOUBLE, [{ fromBase: 1, choice: { kind: 'held', toBase: 2 } }]);
    expect(result.error).toBe("A runner from 1B can't be held at 2B on this hit.");
  });

  it('should reject an advance that is not beyond the standard one', () => {
    const result = evaluateHitRunnerOutcomes(HitType.DOUBLE, [{ fromBase: 1, choice: { kind: 'advanced', toBase: 3 } }]);
    expect(result.error).toMatch(/can't advance to 3B/);
  });
});
