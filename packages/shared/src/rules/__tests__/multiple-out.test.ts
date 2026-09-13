import { multipleOutEligibility } from '../multiple-out';

function state(
  outs: number,
  bases: { first?: boolean; second?: boolean; third?: boolean },
) {
  return {
    outs,
    runnersOnBase: {
      first: bases.first ? 'p1' : null,
      second: bases.second ? 'p2' : null,
      third: bases.third ? 'p3' : null,
    },
  } as Parameters<typeof multipleOutEligibility>[0];
}

describe('multipleOutEligibility', () => {
  it('should offer neither with the bases empty', () => {
    expect(multipleOutEligibility(state(0, {}))).toEqual({
      doublePlay: false,
      triplePlay: false,
    });
  });

  it('should offer a double play but not a triple play with one runner on', () => {
    expect(multipleOutEligibility(state(0, { first: true }))).toEqual({
      doublePlay: true,
      triplePlay: false,
    });
  });

  it('should offer both with two runners on and nobody out', () => {
    expect(multipleOutEligibility(state(0, { first: true, second: true }))).toEqual({
      doublePlay: true,
      triplePlay: true,
    });
  });

  it('should withhold the triple play with one out even when the bases are loaded', () => {
    const result = multipleOutEligibility(
      state(1, { first: true, second: true, third: true }),
    );
    expect(result.triplePlay).toBe(false);
    expect(result.doublePlay).toBe(true);
  });

  it('should withhold both with two outs, however many runners are on', () => {
    expect(
      multipleOutEligibility(state(2, { first: true, second: true, third: true })),
    ).toEqual({ doublePlay: false, triplePlay: false });
  });

  it('should count a runner on any single base toward the double play', () => {
    expect(multipleOutEligibility(state(0, { third: true })).doublePlay).toBe(true);
    expect(multipleOutEligibility(state(0, { second: true })).doublePlay).toBe(true);
  });
});
