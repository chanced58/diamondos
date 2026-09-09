import { sacrificeEligibility } from '../sacrifice';
import { HitTrajectory } from '../../types/game-event';

const bases = (o: Partial<{ first: string; second: string; third: string }> = {}) => ({
  first: o.first ?? null,
  second: o.second ?? null,
  third: o.third ?? null,
});

describe('sacrificeEligibility', () => {
  it('allows both with 0 outs and a runner on third', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases({ third: 'r1' }) }))
      .toEqual({ sacFly: true, sacBunt: true });
  });

  it('denies both with 2 outs (OBR 9.08 "before two are out")', () => {
    expect(sacrificeEligibility({ outs: 2, runnersOnBase: bases({ third: 'r1' }) }))
      .toEqual({ sacFly: false, sacBunt: false });
  });

  it('denies a sac fly with nobody past first', () => {
    const r = sacrificeEligibility({ outs: 1, runnersOnBase: bases({ first: 'r1' }) });
    expect(r.sacFly).toBe(false);
    expect(r.sacBunt).toBe(true);
  });

  it('denies a sac fly with the bases empty', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases() }).sacFly).toBe(false);
  });

  it('allows a sac fly on a runner from second', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases({ second: 'r1' }) }).sacFly).toBe(true);
  });

  it('denies a sac fly on a ground ball', () => {
    expect(
      sacrificeEligibility({ outs: 0, runnersOnBase: bases({ third: 'r1' }) }, HitTrajectory.GROUND_BALL).sacFly,
    ).toBe(false);
  });

  it('allows a sac fly on a fly ball or a line drive (OBR 9.08(d))', () => {
    const st = { outs: 0, runnersOnBase: bases({ third: 'r1' }) };
    expect(sacrificeEligibility(st, HitTrajectory.FLY_BALL).sacFly).toBe(true);
    expect(sacrificeEligibility(st, HitTrajectory.LINE_DRIVE).sacFly).toBe(true);
  });

  it('treats an unknown trajectory as not disqualifying', () => {
    expect(sacrificeEligibility({ outs: 0, runnersOnBase: bases({ third: 'r1' }) }, undefined).sacFly).toBe(true);
  });

  it('denies a sac bunt with 2 outs even on a ground ball', () => {
    expect(
      sacrificeEligibility({ outs: 2, runnersOnBase: bases({ first: 'r1' }) }, HitTrajectory.GROUND_BALL).sacBunt,
    ).toBe(false);
  });
});
