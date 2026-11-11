import { isEventClockAheadRejection, serverNowFromClockRejection } from '../event-clock';

const refusal = {
  code: 'P0001',
  hint: 'device_clock_ahead',
  details: '1767225600000',
  message: 'game_events.occurred_at (2026-01-03 00:00:00+00) is more than 24h ahead of server now (2026-01-01 00:00:00+00); check device clock',
};

describe('isEventClockAheadRejection', () => {
  it('should recognise the trigger refusal by its hint', () => {
    expect(isEventClockAheadRejection(refusal)).toBe(true);
  });

  it('should recognise the refusal by its message when no hint came through', () => {
    expect(isEventClockAheadRejection({ code: 'P0001', message: refusal.message })).toBe(true);
  });

  it('should not treat other raised exceptions as a clock refusal', () => {
    expect(isEventClockAheadRejection({ code: 'P0001', message: 'Tournament cap reached' })).toBe(false);
  });

  it('should not treat other error codes as a clock refusal', () => {
    expect(isEventClockAheadRejection({ ...refusal, code: '23505' })).toBe(false);
    expect(isEventClockAheadRejection(null)).toBe(false);
    expect(isEventClockAheadRejection('P0001')).toBe(false);
  });
});

describe('serverNowFromClockRejection', () => {
  it('should read the server clock from the refusal detail', () => {
    expect(serverNowFromClockRejection(refusal)).toBe(1767225600000);
  });

  it('should be null when the detail is missing or not a number', () => {
    expect(serverNowFromClockRejection({ ...refusal, details: undefined })).toBeNull();
    expect(serverNowFromClockRejection({ ...refusal, details: 'soon' })).toBeNull();
  });

  it('should be null for any other error', () => {
    expect(serverNowFromClockRejection({ code: '42501', details: '1767225600000' })).toBeNull();
  });
});
