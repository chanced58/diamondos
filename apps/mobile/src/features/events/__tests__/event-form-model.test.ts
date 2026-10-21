import { localDateFromParts, partsFromLocalDate } from '../../forms/date-parts';
import { emptyEventFormValues, teamEventInput, validateEventForm } from '../event-form-model';

const TEAM = '11111111-1111-4111-8111-111111111111';

describe('date parts', () => {
  it('should round-trip a wall-clock date and time through a local Date', () => {
    const local = localDateFromParts('2026-10-22', '18:05');
    expect(local.getHours()).toBe(18);
    expect(local.getDate()).toBe(22);
    expect(partsFromLocalDate(local)).toEqual({ date: '2026-10-22', time: '18:05' });
  });
});

describe('teamEventInput', () => {
  const values = { ...emptyEventFormValues({ date: '2026-10-22' }), title: 'Team dinner' };

  it('should send the start as the instant the device reads it as, and no end unless asked', () => {
    const input = teamEventInput(TEAM, values, 'America/Boise');
    expect(input).toMatchObject({ teamId: TEAM, title: 'Team dinner', eventType: 'meeting', endsAt: null, timeZone: 'America/Boise' });
    expect(input.startsAt).toBe(localDateFromParts('2026-10-22', '18:00').toISOString());
  });

  it('should map a picked venue onto the location fields', () => {
    const venue = { name: 'Clubhouse', address: '1 Main St', latitude: 43.6, longitude: -116.2, placeId: 'p1' };
    expect(teamEventInput(TEAM, { ...values, venue }, null)).toMatchObject({
      location: 'Clubhouse', address: '1 Main St', latitude: 43.6, longitude: -116.2, placeId: 'p1',
    });
  });
});

describe('validateEventForm', () => {
  const values = { ...emptyEventFormValues({ date: '2026-10-22' }), title: 'Team dinner' };

  it('should require a title', () => {
    expect(validateEventForm(TEAM, { ...values, title: '  ' })).toBe('Event title is required.');
    expect(validateEventForm(TEAM, values)).toBeNull();
  });

  it('should reject an end before the start', () => {
    expect(validateEventForm(TEAM, { ...values, hasEnd: true, endTime: '17:00' })).toBe('The event must end after it starts.');
  });
});
