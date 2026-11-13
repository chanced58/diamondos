import { addPlayerSheetCopy, possessive, theirPitcherStripLabel } from '../scorer-copy';

describe('possessive', () => {
  it("should add 's to a team name", () => {
    expect(possessive('SHAKEDOWN Away')).toBe("SHAKEDOWN Away's");
  });

  it('should add only an apostrophe to a name ending in s', () => {
    expect(possessive('Huskies')).toBe("Huskies'");
  });
});

describe('addPlayerSheetCopy', () => {
  it("should name the team whose order a batter joins", () => {
    expect(addPlayerSheetCopy('batter', 'SHAKEDOWN Away')).toEqual({
      lead: "Goes to the end of SHAKEDOWN Away's order.",
      submit: "Add to SHAKEDOWN Away's order",
    });
  });

  it('should name the team a new pitcher takes the mound for', () => {
    expect(addPlayerSheetCopy('pitcher', 'SHAKEDOWN Home')).toEqual({
      lead: 'Takes the mound for SHAKEDOWN Home now.',
      submit: 'Put in to pitch',
    });
  });
});

describe('theirPitcherStripLabel', () => {
  it('should ask for their pitcher when none is set', () => {
    expect(theirPitcherStripLabel(null)).toEqual({ label: 'Set their pitcher ▸', needsPitcher: true });
  });

  it('should name their pitcher when one is set', () => {
    expect(theirPitcherStripLabel('#12 Sam Ortiz')).toEqual({ label: '#12 Sam Ortiz ▸', needsPitcher: false });
  });
});
