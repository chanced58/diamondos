import type { GameDetailResponse } from '@baseball/shared';
import {
  emptyGameFormValues,
  gameFormFields,
  gameFormValuesFromGame,
  validateGameForm,
  type GameFormValues,
} from '../game-form-model';

type Game = GameDetailResponse['game'];

const game: Game = {
  id: 'g1',
  teamId: 't1',
  status: 'scheduled',
  opponentName: 'Eagles',
  opponentTeamId: 'opp-1',
  scheduledAt: '2026-10-23T00:00:00.000Z',
  timeZone: 'America/Boise',
  locationType: 'neutral',
  neutralHomeTeam: 'opponent',
  venueName: 'Riverside Park',
  venueAddress: '1 Park Way, Boise, ID',
  placeId: 'p1',
  notes: 'Bring both uniforms',
  homeScore: 0,
  awayScore: 0,
  currentInning: null,
  latitude: 43.6,
  longitude: -116.2,
  tournamentId: null,
};

describe('emptyGameFormValues', () => {
  it('should start on the local date at 4 PM with a typed opponent', () => {
    // 03:00 UTC on Oct 22 is still Oct 21 in Boise.
    const values = emptyGameFormValues(new Date('2026-10-22T03:00:00Z'), 'America/Boise');
    expect(values).toMatchObject({ date: '2026-10-21', time: '16:00', opponentMode: 'name', locationType: 'home' });
  });
});

describe('gameFormValuesFromGame', () => {
  it("should prefill the edit form in the game's own zone with its venue", () => {
    const values = gameFormValuesFromGame(game, 'America/New_York');
    expect(values).toEqual({
      opponentMode: 'team',
      opponentTeamId: 'opp-1',
      opponentName: 'Eagles',
      date: '2026-10-22',
      time: '18:00',
      locationType: 'neutral',
      neutralHomeTeam: 'opponent',
      venue: { name: 'Riverside Park', address: '1 Park Way, Boise, ID', latitude: 43.6, longitude: -116.2, placeId: 'p1' },
      notes: 'Bring both uniforms',
      notifyTeam: false,
    });
  });

  it('should read a game without a team record or opponent as typed or TBD', () => {
    expect(gameFormValuesFromGame({ ...game, opponentTeamId: null }).opponentMode).toBe('name');
    expect(gameFormValuesFromGame({ ...game, opponentTeamId: null, opponentName: '  ' }).opponentMode).toBe('tbd');
  });
});

describe('gameFormFields', () => {
  const base: GameFormValues = { ...emptyGameFormValues(new Date('2026-10-22T18:00:00Z'), 'UTC'), opponentName: ' Eagles ' };

  it('should send a TBD game without any opponent', () => {
    const fields = gameFormFields({ ...base, opponentMode: 'tbd', opponentTeamId: 'x' }, 'America/Boise');
    expect(fields).toMatchObject({ opponentTbd: true, opponentName: null, opponentTeamId: null, deviceTimeZone: 'America/Boise' });
  });

  it('should drop the neutral home team away from a neutral site and trim text', () => {
    const fields = gameFormFields({ ...base, neutralHomeTeam: 'opponent', notes: '  ', venue: { name: ' Field 2 ', address: null, latitude: null, longitude: null, placeId: null } }, null);
    expect(fields).toMatchObject({ opponentName: 'Eagles', neutralHomeTeam: null, notes: null, venue: { name: 'Field 2' } });
  });
});

describe('validateGameForm', () => {
  const valid: GameFormValues = { ...emptyGameFormValues(new Date('2026-10-22T18:00:00Z'), 'UTC'), opponentName: 'Eagles' };

  it('should pass a complete form', () => {
    expect(validateGameForm(valid)).toBeNull();
  });

  it('should ask for an opponent unless the game is TBD', () => {
    expect(validateGameForm({ ...valid, opponentName: '' })).toBe('Opponent name is required.');
    expect(validateGameForm({ ...valid, opponentName: '', opponentMode: 'tbd' })).toBeNull();
    expect(validateGameForm({ ...valid, opponentMode: 'team', opponentTeamId: null })).toBe('Pick an opponent team.');
  });
});
