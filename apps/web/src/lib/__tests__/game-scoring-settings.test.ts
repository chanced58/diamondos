import { defaultLeagueScoringSettings } from '@baseball/shared';
import { getScoringSettingsForGame } from '../game-scoring-settings';

type QueryResult = { data: unknown; error: null | { message: string } };

function fakeDb(results: Record<string, QueryResult>) {
  const filters: Record<string, Record<string, unknown>> = {};
  const db = {
    filters,
    from(table: string) {
      filters[table] = {};
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { filters[table][column] = value; return query; },
        limit() { return query; },
        maybeSingle() { return Promise.resolve(results[table] ?? { data: null, error: null }); },
      };
      return query;
    },
  };
  return db;
}

function withLineup(allowExpanded: boolean, maxBatters: number) {
  return {
    ...defaultLeagueScoringSettings(),
    lineup: { ...defaultLeagueScoringSettings().lineup, allowExpanded, maxBatters },
  };
}

describe('getScoringSettingsForGame', () => {
  it('uses tournament-specific settings for two tournaments on the same team', async () => {
    const firstDb = fakeDb({
      tournaments: {
        data: { scoring_settings: withLineup(true, 12) },
        error: null,
      },
    });
    const secondDb = fakeDb({
      tournaments: {
        data: { scoring_settings: withLineup(true, 10) },
        error: null,
      },
    });

    const firstSettings = await getScoringSettingsForGame(firstDb as never, {
      teamId: 'same-team', tournamentId: 'tournament-one', scoringSettingsSnapshot: null,
    });
    const secondSettings = await getScoringSettingsForGame(secondDb as never, {
      teamId: 'same-team', tournamentId: 'tournament-two', scoringSettingsSnapshot: null,
    });

    expect(firstDb.filters.tournaments).toMatchObject({ id: 'tournament-one' });
    expect(secondDb.filters.tournaments).toMatchObject({ id: 'tournament-two' });
    expect(firstSettings.lineup.maxBatters).toBe(12);
    expect(secondSettings.lineup.maxBatters).toBe(10);
  });

  it('keeps a started game on its frozen settings after tournament settings change', async () => {
    const frozen = withLineup(true, 12);
    const db = fakeDb({
      tournaments: { data: { scoring_settings: withLineup(false, 9) }, error: null },
    });

    const settings = await getScoringSettingsForGame(db as never, {
      teamId: 'same-team', tournamentId: 'tournament-one', scoringSettingsSnapshot: frozen,
    });

    expect(settings.lineup).toEqual(frozen.lineup);
    expect(db.filters.tournaments).toBeUndefined();
  });

  it('fails closed when tournament settings cannot be loaded', async () => {
    const db = fakeDb({ tournaments: { data: null, error: { message: 'database unavailable' } } });
    const logError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(getScoringSettingsForGame(db as never, {
        teamId: 'same-team', tournamentId: 'tournament-one', scoringSettingsSnapshot: null,
      })).rejects.toThrow('Unable to load tournament scoring settings');
    } finally {
      logError.mockRestore();
    }
  });

  it('retains the existing league-settings path for regular games', async () => {
    const db = fakeDb({
      league_members: { data: null, error: null },
    });

    const settings = await getScoringSettingsForGame(db as never, {
      teamId: 'regular-team', tournamentId: null, scoringSettingsSnapshot: null,
    });

    expect(settings).toEqual(defaultLeagueScoringSettings());
    expect(db.filters.league_members).toMatchObject({ team_id: 'regular-team', is_active: true });
  });
});
