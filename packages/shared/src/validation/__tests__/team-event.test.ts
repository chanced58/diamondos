import { createTeamEventSchema } from '../team-event';

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const base = { teamId: TEAM_ID, title: 'Team meeting', startsAt: '2026-10-21T18:00:00.000Z' };

describe('createTeamEventSchema', () => {
  it('should apply defaults and turn blank optional text into null', () => {
    const parsed = createTeamEventSchema.parse({ ...base, title: '  Team meeting  ', location: '  ' });

    expect(parsed).toEqual({
      teamId: TEAM_ID,
      title: 'Team meeting',
      eventType: 'other',
      startsAt: base.startsAt,
      endsAt: null,
      location: null,
      address: null,
      latitude: null,
      longitude: null,
      placeId: null,
      description: null,
      timeZone: null,
      notifyTeam: false,
    });
  });

  it('should accept ISO times with an offset', () => {
    expect(createTeamEventSchema.safeParse({ ...base, startsAt: '2026-10-21T13:00:00-05:00' }).success).toBe(true);
  });

  it('should reject a blank title, a bad team id, an unknown type, or a wall-clock time', () => {
    expect(createTeamEventSchema.safeParse({ ...base, title: '   ' }).error?.issues[0].message)
      .toBe('Event title is required.');
    expect(createTeamEventSchema.safeParse({ ...base, teamId: '' }).error?.issues[0].message)
      .toBe('Missing team ID.');
    expect(createTeamEventSchema.safeParse({ ...base, eventType: 'party' }).success).toBe(false);
    expect(createTeamEventSchema.safeParse({ ...base, startsAt: '2026-10-21T18:00' }).success).toBe(false);
  });

  it('should reject an event that ends before it starts', () => {
    const result = createTeamEventSchema.safeParse({ ...base, endsAt: '2026-10-21T17:00:00.000Z' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe('The event must end after it starts.');
  });
});

describe('createTeamEventSchema timeZone', () => {
  it('should accept an IANA zone, default to null, and reject an unknown zone', () => {
    expect(createTeamEventSchema.parse({ ...base, timeZone: 'America/Chicago' }).timeZone).toBe('America/Chicago');
    expect(createTeamEventSchema.parse(base).timeZone).toBeNull();
    expect(createTeamEventSchema.safeParse({ ...base, timeZone: 'Mars/Olympus' }).success).toBe(false);
  });
});
