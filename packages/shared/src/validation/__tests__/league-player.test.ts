import {
  createLeaguePlayerSchema,
  transferPlayerSchema,
  releasePlayerSchema,
  updateLeaguePlayerSchema,
} from '../league-player';

describe('createLeaguePlayerSchema', () => {
  const base = {
    leagueId: '00000000-0000-0000-0000-000000000001',
    firstName: 'Mateo',
    lastName: 'Reyes',
  };

  it('accepts the minimum required shape', () => {
    expect(createLeaguePlayerSchema.parse(base)).toMatchObject({
      firstName: 'Mateo',
      lastName: 'Reyes',
    });
  });

  it('trims first and last names', () => {
    const out = createLeaguePlayerSchema.parse({ ...base, firstName: '  Sam  ', lastName: '  Chen  ' });
    expect(out.firstName).toBe('Sam');
    expect(out.lastName).toBe('Chen');
  });

  it('rejects empty first name', () => {
    expect(() => createLeaguePlayerSchema.parse({ ...base, firstName: ' ' })).toThrow();
  });

  it('coerces empty optional team_id to undefined', () => {
    const out = createLeaguePlayerSchema.parse({ ...base, teamId: '' });
    expect(out.teamId).toBeUndefined();
  });

  it('rejects malformed UUIDs on team_id', () => {
    expect(() => createLeaguePlayerSchema.parse({ ...base, teamId: 'not-a-uuid' })).toThrow();
  });

  it('rejects jersey numbers outside 0..99', () => {
    expect(() => createLeaguePlayerSchema.parse({ ...base, jerseyNumber: -1 })).toThrow();
    expect(() => createLeaguePlayerSchema.parse({ ...base, jerseyNumber: 100 })).toThrow();
  });
});

describe('transferPlayerSchema', () => {
  const base = {
    leagueId: '00000000-0000-0000-0000-000000000001',
    playerId: '00000000-0000-0000-0000-000000000002',
    toTeamId: '00000000-0000-0000-0000-000000000003',
  };

  it('accepts the minimum required shape', () => {
    expect(transferPlayerSchema.parse(base)).toMatchObject({
      toTeamId: base.toTeamId,
      acceptJerseyClear: false,
    });
  });

  it('defaults acceptJerseyClear to false', () => {
    expect(transferPlayerSchema.parse(base).acceptJerseyClear).toBe(false);
  });

  it('rejects when toTeamId is missing', () => {
    const { toTeamId, ...without } = base;
    void toTeamId;
    expect(() => transferPlayerSchema.parse(without)).toThrow();
  });

  it('caps reason at 500 chars', () => {
    expect(() => transferPlayerSchema.parse({ ...base, reason: 'x'.repeat(501) })).toThrow();
  });
});

describe('releasePlayerSchema', () => {
  it('accepts minimum required shape', () => {
    expect(
      releasePlayerSchema.parse({
        leagueId: '00000000-0000-0000-0000-000000000001',
        playerId: '00000000-0000-0000-0000-000000000002',
      }),
    ).toBeTruthy();
  });
});

describe('updateLeaguePlayerSchema', () => {
  it('requires playerId', () => {
    expect(() => updateLeaguePlayerSchema.parse({ firstName: 'Jordan' })).toThrow();
  });

  it('allows partial updates with only playerId + one field', () => {
    expect(
      updateLeaguePlayerSchema.parse({
        playerId: '00000000-0000-0000-0000-000000000002',
        firstName: 'Jordan',
      }),
    ).toMatchObject({ firstName: 'Jordan' });
  });
});
