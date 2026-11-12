import { adultLeagueScoringSettings } from '../adult-settings';

describe('adultLeagueScoringSettings', () => {
  it('should default an adult league to nine-inning rate stats', () => {
    const settings = adultLeagueScoringSettings(null);
    expect(settings.gameLength.statInnings).toBe(9);
    expect(settings.gameLength.maxInnings).toBe(9);
  });

  it("should keep the league's other settings", () => {
    const settings = adultLeagueScoringSettings({
      gameLength: { maxInnings: 7, mercy: { enabled: true, runDiff: 10, afterInning: 5 } },
      scorekeeping: { dualScorekeeper: true },
    });
    expect(settings.gameLength).toMatchObject({ maxInnings: 7, statInnings: 9, mercy: { enabled: true } });
    expect(settings.scorekeeping.dualScorekeeper).toBe(true);
  });
});
