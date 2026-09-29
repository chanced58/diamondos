import { HitType } from '../../types/game-event';
import { evaluateHitRunnerOutcomes, evaluatePlayRunnerOutcomes, hitRunnerOptions, playRunnerOptions } from '../hit-runner-outcomes';

describe('hitRunnerOptions', () => {
  describe('on a single', () => {
    it('should move a runner from first to second, with third or home as advances', () => {
      expect(hitRunnerOptions(1, HitType.SINGLE)).toEqual({ standardBase: 2, heldBase: null, advancedBases: [3, 4], stayBase: null });
    });

    it('should move a runner from second to third, with home as the advance', () => {
      expect(hitRunnerOptions(2, HitType.SINGLE)).toEqual({ standardBase: 3, heldBase: null, advancedBases: [4], stayBase: null });
    });

    it('should score a runner from third with nothing beyond it', () => {
      expect(hitRunnerOptions(3, HitType.SINGLE)).toEqual({ standardBase: 4, heldBase: null, advancedBases: [], stayBase: null });
    });
  });

  describe('on a double', () => {
    it('should send a runner from first to third with no hold, because the batter takes second', () => {
      expect(hitRunnerOptions(1, HitType.DOUBLE)).toEqual({ standardBase: 3, heldBase: null, advancedBases: [4], stayBase: null });
    });

    it('should score a runner from second, who can be held at third', () => {
      expect(hitRunnerOptions(2, HitType.DOUBLE)).toEqual({ standardBase: 4, heldBase: 3, advancedBases: [], stayBase: null });
    });

    it('should score a runner from third with no hold', () => {
      expect(hitRunnerOptions(3, HitType.DOUBLE)).toEqual({ standardBase: 4, heldBase: null, advancedBases: [], stayBase: null });
    });
  });

  describe('on a triple', () => {
    it.each([1, 2, 3] as const)('should score a runner from base %i with no hold, because the batter takes third', (fromBase) => {
      expect(hitRunnerOptions(fromBase, HitType.TRIPLE)).toEqual({ standardBase: 4, heldBase: null, advancedBases: [], stayBase: null });
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
    expect(result.error).toBe("A runner from 1B can't be held at 2B on this play.");
  });

  it('should reject an advance that is not beyond the standard one', () => {
    const result = evaluateHitRunnerOutcomes(HitType.DOUBLE, [{ fromBase: 1, choice: { kind: 'advanced', toBase: 3 } }]);
    expect(result.error).toMatch(/can't advance to 3B/);
  });
});

describe('holding an unforced runner at his own base', () => {
  it('should let a runner on 2nd with 1st open stay at 2nd on a single', () => {
    expect(hitRunnerOptions(2, HitType.SINGLE, [2])?.stayBase).toBe(2);
  });

  it('should not let a runner on 2nd stay when a runner on 1st forces him', () => {
    expect(hitRunnerOptions(2, HitType.SINGLE, [1, 2])?.stayBase).toBeNull();
  });

  it('should let a runner on 3rd stay on a single unless 1st and 2nd are both occupied', () => {
    expect(hitRunnerOptions(3, HitType.SINGLE, [3])?.stayBase).toBe(3);
    expect(hitRunnerOptions(3, HitType.SINGLE, [1, 3])?.stayBase).toBe(3);
    expect(hitRunnerOptions(3, HitType.SINGLE, [2, 3])?.stayBase).toBe(3);
    expect(hitRunnerOptions(3, HitType.SINGLE, [1, 2, 3])?.stayBase).toBeNull();
  });

  it('should let a runner on 3rd stay on a double only when no trailing runner needs 3rd', () => {
    expect(hitRunnerOptions(3, HitType.DOUBLE, [3])?.stayBase).toBe(3);
    expect(hitRunnerOptions(3, HitType.DOUBLE, [1, 3])?.stayBase).toBeNull();
    expect(hitRunnerOptions(3, HitType.DOUBLE, [2, 3])?.stayBase).toBeNull();
  });

  it('should never let a runner on 1st stay, or anyone the batter passes', () => {
    expect(hitRunnerOptions(1, HitType.SINGLE, [1])?.stayBase).toBeNull();
    expect(hitRunnerOptions(2, HitType.DOUBLE, [2])?.stayBase).toBeNull();
    expect(hitRunnerOptions(3, HitType.TRIPLE, [3])?.stayBase).toBeNull();
  });

  it('should accept an unforced runner held at his own base', () => {
    const result = evaluateHitRunnerOutcomes(HitType.SINGLE, [
      { fromBase: 2, choice: { kind: 'held', toBase: 2 } },
    ]);
    expect(result).toEqual({ error: null, rbis: 0 });
  });

  it('should refuse holding a forced runner at his own base', () => {
    const result = evaluateHitRunnerOutcomes(HitType.SINGLE, [
      { fromBase: 1, choice: { kind: 'auto' } },
      { fromBase: 2, choice: { kind: 'held', toBase: 2 } },
    ]);
    expect(result.error).not.toBeNull();
  });

  it('should refuse a hold that leaves two runners on one base', () => {
    const result = evaluateHitRunnerOutcomes(HitType.SINGLE, [
      { fromBase: 2, choice: { kind: 'auto' } },
      { fromBase: 3, choice: { kind: 'held', toBase: 3 } },
    ]);
    expect(result.error).toBe("Two runners can't both finish on 3B.");
  });
});

describe('holding after a trailing force out (OBR 5.09(b)(6))', () => {
  it('should let the runner from 2nd hold at 2nd once the runner from 1st is thrown out', () => {
    const result = evaluateHitRunnerOutcomes(HitType.SINGLE, [
      { fromBase: 1, choice: { kind: 'thrown_out' } },
      { fromBase: 2, choice: { kind: 'held', toBase: 2 } },
    ]);
    expect(result).toEqual({ error: null, rbis: 0 });
  });
});

describe('sacrifice runner options', () => {
  it('should move runners up one base on a sac bunt, with a hold at their own base', () => {
    expect(playRunnerOptions(1, { kind: 'sac_bunt' }, [1])).toEqual({
      standardBase: 2, heldBase: null, advancedBases: [3, 4], stayBase: 1,
    });
    expect(playRunnerOptions(3, { kind: 'sac_bunt' }, [3])).toEqual({
      standardBase: 4, heldBase: null, advancedBases: [], stayBase: 3,
    });
  });

  it('should score the runner from 3rd on a sac fly and hold everyone else by default', () => {
    expect(playRunnerOptions(3, { kind: 'sac_fly' }, [3])).toEqual({
      standardBase: 4, heldBase: null, advancedBases: [], stayBase: 3,
    });
    expect(playRunnerOptions(2, { kind: 'sac_fly' }, [2, 3])).toEqual({
      standardBase: 2, heldBase: null, advancedBases: [3, 4], stayBase: null,
    });
  });

  it('should delegate hits to the hit rules', () => {
    expect(playRunnerOptions(2, { kind: 'hit', hitType: HitType.SINGLE }, [2])).toEqual(
      hitRunnerOptions(2, HitType.SINGLE, [2]),
    );
  });
});

describe('evaluatePlayRunnerOutcomes — sacrifices (OBR 9.08)', () => {
  it('should accept a sac fly that scores the runner from 3rd, with one RBI', () => {
    expect(evaluatePlayRunnerOutcomes({ kind: 'sac_fly' }, [{ fromBase: 3, choice: { kind: 'auto' } }])).toEqual({
      error: null,
      rbis: 1,
    });
  });

  it('should refuse a sac fly on which no run scores', () => {
    const result = evaluatePlayRunnerOutcomes({ kind: 'sac_fly' }, [{ fromBase: 3, choice: { kind: 'thrown_out' } }]);
    expect(result.error).toBe('No run scored — record it as a fly out instead.');
  });

  it('should accept a sac fly where the runner from 2nd tags to 3rd as the runner from 3rd scores', () => {
    expect(
      evaluatePlayRunnerOutcomes({ kind: 'sac_fly' }, [
        { fromBase: 2, choice: { kind: 'advanced', toBase: 3 } },
        { fromBase: 3, choice: { kind: 'auto' } },
      ]),
    ).toEqual({ error: null, rbis: 1 });
  });

  it('should accept a sac bunt that advances only the runner from 2nd while the runner from 1st holds', () => {
    // Runner from 1st holds; runner from 2nd moves to 3rd.
    expect(
      evaluatePlayRunnerOutcomes({ kind: 'sac_bunt' }, [
        { fromBase: 1, choice: { kind: 'held', toBase: 1 } },
        { fromBase: 2, choice: { kind: 'auto' } },
      ]),
    ).toEqual({ error: null, rbis: 0 });
  });

  it('should refuse a sac bunt on which no runner advances', () => {
    const result = evaluatePlayRunnerOutcomes({ kind: 'sac_bunt' }, [{ fromBase: 1, choice: { kind: 'held', toBase: 1 } }]);
    expect(result.error).toBe('No runner advanced — record it as an out instead.');
  });

  it('should still refuse two runners on one base', () => {
    const result = evaluatePlayRunnerOutcomes({ kind: 'sac_bunt' }, [
      { fromBase: 1, choice: { kind: 'auto' } },
      { fromBase: 2, choice: { kind: 'held', toBase: 2 } },
    ]);
    expect(result.error).toBe("Two runners can't both finish on 2B.");
  });
});

describe('sac bunt with a runner put out (OBR 9.08(a))', () => {
  it('should refuse a sac bunt when a runner is put out, even if another runner advances', () => {
    const result = evaluatePlayRunnerOutcomes({ kind: 'sac_bunt' }, [
      { fromBase: 1, choice: { kind: 'thrown_out' } },
      { fromBase: 2, choice: { kind: 'auto' } },
    ]);
    expect(result.error).toBe('A runner was put out advancing — record it as an out instead.');
  });

  it('should still allow a runner thrown out on a sac fly when a run scores', () => {
    expect(
      evaluatePlayRunnerOutcomes({ kind: 'sac_fly' }, [
        { fromBase: 2, choice: { kind: 'thrown_out' } },
        { fromBase: 3, choice: { kind: 'auto' } },
      ]),
    ).toEqual({ error: null, rbis: 1 });
  });
});
