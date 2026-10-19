import {
  formatDate,
  formatInTimeZone,
  formatTime,
  isValidTimeZone,
  utcToZonedDateTime,
  zonedDateTimeToUtc,
} from '../date';

describe('zonedDateTimeToUtc', () => {
  it('reads the wall-clock time in the given zone, not the host zone', () => {
    // Arizona never observes DST: UTC-7 year-round.
    expect(zonedDateTimeToUtc('2026-10-19', '12:30', 'America/Phoenix')).toBe('2026-10-19T19:30:00.000Z');
    expect(zonedDateTimeToUtc('2026-01-19', '12:30', 'America/Phoenix')).toBe('2026-01-19T19:30:00.000Z');
  });

  it('uses the offset in effect on the game date, not today', () => {
    expect(zonedDateTimeToUtc('2026-03-07', '16:00', 'America/Boise')).toBe('2026-03-07T23:00:00.000Z'); // MST
    expect(zonedDateTimeToUtc('2026-03-09', '16:00', 'America/Boise')).toBe('2026-03-09T22:00:00.000Z'); // MDT
  });

  it('rolls an evening game into the next UTC day', () => {
    expect(zonedDateTimeToUtc('2026-04-10', '19:00', 'America/Los_Angeles')).toBe('2026-04-11T02:00:00.000Z');
  });

  it('moves a nonexistent spring-forward time onto the far side of the gap', () => {
    // 02:30 does not exist in Boise on 2026-03-08; treat it as 03:30 MDT.
    expect(zonedDateTimeToUtc('2026-03-08', '02:30', 'America/Boise')).toBe('2026-03-08T09:30:00.000Z');
    // Same rule east of UTC: 02:30 does not exist in Berlin on 2026-03-29; 03:30 CEST.
    expect(zonedDateTimeToUtc('2026-03-29', '02:30', 'Europe/Berlin')).toBe('2026-03-29T01:30:00.000Z');
  });

  it('picks a real instant for an ambiguous fall-back time', () => {
    const iso = zonedDateTimeToUtc('2026-11-01', '01:30', 'America/Boise');
    expect(['2026-11-01T07:30:00.000Z', '2026-11-01T08:30:00.000Z']).toContain(iso);
  });

  it('treats UTC as UTC', () => {
    expect(zonedDateTimeToUtc('2026-10-19', '12:30', 'UTC')).toBe('2026-10-19T12:30:00.000Z');
  });

  it('throws on an unknown zone or malformed input', () => {
    expect(() => zonedDateTimeToUtc('2026-10-19', '12:30', 'Mars/Olympus')).toThrow();
    expect(() => zonedDateTimeToUtc('10/19/2026', '12:30', 'UTC')).toThrow();
    expect(() => zonedDateTimeToUtc('2026-10-19', 'noon', 'UTC')).toThrow();
  });
});

describe('utcToZonedDateTime', () => {
  it('round-trips with zonedDateTimeToUtc', () => {
    const iso = zonedDateTimeToUtc('2026-04-10', '19:00', 'America/Los_Angeles');
    expect(utcToZonedDateTime(iso, 'America/Los_Angeles')).toEqual({ date: '2026-04-10', time: '19:00' });
  });

  it('formats midnight as 00:00, not 24:00', () => {
    expect(utcToZonedDateTime('2026-10-20T07:00:00.000Z', 'America/Phoenix')).toEqual({ date: '2026-10-20', time: '00:00' });
  });
});

describe('formatDate / formatTime with a zone', () => {
  const iso = '2026-10-20T02:00:00.000Z'; // 7:00 PM on Oct 19 in Phoenix

  it('shows the game-local date and time', () => {
    expect(formatDate(iso, 'America/Phoenix')).toBe('Oct 19, 2026');
    expect(formatTime(iso, 'America/Phoenix')).toBe('7:00 PM');
  });

  it('falls back to the host zone when the zone is missing or bogus', () => {
    expect(formatTime(iso, null)).toBe(formatTime(iso));
    expect(formatTime(iso, 'Mars/Olympus')).toBe(formatTime(iso));
  });
});

describe('formatInTimeZone', () => {
  it('applies custom options in the zone', () => {
    const iso = '2026-10-20T02:00:00.000Z';
    expect(formatInTimeZone(iso, 'America/Phoenix', { weekday: 'short', day: 'numeric' })).toBe('19 Mon');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA names and rejects junk', () => {
    expect(isValidTimeZone('America/Boise')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});
