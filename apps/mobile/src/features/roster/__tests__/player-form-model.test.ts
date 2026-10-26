import { BatsThrows, PlayerPosition, type RosterPlayer } from '@baseball/shared';
import { emptyPlayerForm, formFromPlayer, toPlayerFields } from '../player-form-model';
import { createRosterPlayer, endInjuryFlag, reactivateRosterPlayer, updateRosterPlayer } from '../roster-api';
import type { ApiClient } from '../../../lib/api-client';

const player: RosterPlayer = {
  id: 'p1',
  teamId: 't1',
  firstName: 'Sam',
  lastName: 'Lee',
  jerseyNumber: 7,
  primaryPosition: 'shortstop',
  secondaryPositions: ['pitcher', 'goalie'],
  bats: 'left',
  throws: 'sideways',
  graduationYear: 2027,
  email: null,
  phone: '555-0100',
  isActive: true,
  disabledAt: null,
};

describe('player form model', () => {
  it('should fill the form from a player, dropping values the form can’t show', () => {
    expect(formFromPlayer(player)).toEqual({
      firstName: 'Sam',
      lastName: 'Lee',
      jerseyNumber: '7',
      primaryPosition: PlayerPosition.SHORTSTOP,
      secondaryPositions: [PlayerPosition.PITCHER],
      bats: BatsThrows.LEFT,
      throws: null,
      graduationYear: '2027',
      email: '',
      phone: '555-0100',
    });
  });

  it('should turn the form into the shared contract, without the primary among the secondaries', () => {
    const result = toPlayerFields({
      ...emptyPlayerForm,
      firstName: 'Sam',
      lastName: 'Lee',
      jerseyNumber: ' 12 ',
      primaryPosition: PlayerPosition.PITCHER,
      secondaryPositions: [PlayerPosition.PITCHER, PlayerPosition.CATCHER],
      email: 'Sam@Example.com',
    });
    expect(result).toEqual({
      fields: {
        firstName: 'Sam',
        lastName: 'Lee',
        jerseyNumber: 12,
        primaryPosition: PlayerPosition.PITCHER,
        secondaryPositions: [PlayerPosition.CATCHER],
        bats: null,
        throws: null,
        graduationYear: null,
        email: 'sam@example.com',
        phone: null,
      },
    });
  });

  it('should explain the first problem in words a coach reads', () => {
    const named = { ...emptyPlayerForm, firstName: 'Sam', lastName: 'Lee' };
    expect(toPlayerFields({ ...named, jerseyNumber: '12a' })).toEqual({ error: 'Jersey numbers run 0–99.' });
    expect(toPlayerFields({ ...named, jerseyNumber: '100' })).toEqual({ error: 'Jersey numbers run 0–99.' });
    expect(toPlayerFields({ ...named, graduationYear: '27' })).toEqual({ error: 'Enter a four-digit graduation year.' });
    expect(toPlayerFields({ ...named, firstName: '' })).toEqual({ error: 'First name is required' });
    expect(toPlayerFields({ ...named, email: 'nope' })).toEqual({ error: 'Must be a valid email address' });
  });
});

describe('roster api', () => {
  it('should call the player routes with encoded ids', async () => {
    const client = { post: jest.fn().mockResolvedValue({}), patch: jest.fn().mockResolvedValue({}) } as unknown as ApiClient;
    const fields = toPlayerFields({ ...emptyPlayerForm, firstName: 'Sam', lastName: 'Lee' });
    if (!('fields' in fields)) throw new Error('form should be valid');

    await createRosterPlayer('t 1', fields.fields, client);
    expect(client.post).toHaveBeenCalledWith('/teams/t%201/players', fields.fields, expect.anything());
    await updateRosterPlayer('t1', 'p1', fields.fields, client);
    expect(client.patch).toHaveBeenCalledWith('/teams/t1/players/p1', fields.fields, expect.anything());
    await reactivateRosterPlayer('t1', 'p1', null, client);
    expect(client.post).toHaveBeenCalledWith('/teams/t1/players/p1/reactivate', { jerseyNumber: null }, expect.anything());
    await endInjuryFlag('t1', 'p1', 'f1', '2026-10-25', client);
    expect(client.post).toHaveBeenCalledWith('/teams/t1/players/p1/injury-flags/f1/end', { endDate: '2026-10-25' }, expect.anything());
  });
});
