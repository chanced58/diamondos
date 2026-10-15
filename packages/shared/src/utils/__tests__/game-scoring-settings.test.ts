import {
  defaultLeagueScoringSettings,
  resolveTournamentGameSettingsCache,
  TOURNAMENT_SCORING_RULES_VERSION,
} from '../../index';

function tournamentSettings(maxBatters: number) {
  return {
    ...defaultLeagueScoringSettings(),
    lineup: {
      ...defaultLeagueScoringSettings().lineup,
      allowExpanded: true,
      maxBatters,
      allowMidGameExtension: true,
      allowMidGameContraction: true,
    },
  };
}

describe('resolveTournamentGameSettingsCache', () => {
  it('keeps same-team games on their own cached tournament rules', () => {
    const firstGame = resolveTournamentGameSettingsCache({
      tournamentId: 'tournament-a',
      rulesVersion: TOURNAMENT_SCORING_RULES_VERSION,
      scoringSettings: tournamentSettings(12),
    });
    const secondGame = resolveTournamentGameSettingsCache({
      tournamentId: 'tournament-b',
      rulesVersion: TOURNAMENT_SCORING_RULES_VERSION,
      scoringSettings: tournamentSettings(10),
    });

    expect(firstGame.lineup.maxBatters).toBe(12);
    expect(secondGame.lineup.maxBatters).toBe(10);
  });

  it('fails closed when a tournament cache is missing, stale, or lacks lineup rules', () => {
    expect(() =>
      resolveTournamentGameSettingsCache({
        tournamentId: 'tournament-a',
        rulesVersion: null,
        scoringSettings: tournamentSettings(12),
      }),
    ).toThrow(/unsupported version/);
    expect(() =>
      resolveTournamentGameSettingsCache({
        tournamentId: 'tournament-a',
        rulesVersion: TOURNAMENT_SCORING_RULES_VERSION,
        scoringSettings: {},
      }),
    ).toThrow(/incomplete/);
  });

  it('rejects inconsistent expansion caps instead of falling back to platform defaults', () => {
    expect(() =>
      resolveTournamentGameSettingsCache({
        tournamentId: 'tournament-a',
        rulesVersion: TOURNAMENT_SCORING_RULES_VERSION,
        scoringSettings: {
          ...tournamentSettings(12),
          lineup: {
            ...tournamentSettings(12).lineup,
            allowExpanded: false,
            maxBatters: 12,
          },
        },
      }),
    ).toThrow(/incomplete/);
  });
});
