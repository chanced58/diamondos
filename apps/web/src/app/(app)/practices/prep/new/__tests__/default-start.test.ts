import { computeDefaultScheduledAt } from '../default-start';

describe('computeDefaultScheduledAt', () => {
  const now = new Date('2026-10-25T18:00:00Z');

  it("should pick 3 PM in the game's zone two days before it, whatever the server's zone", () => {
    // A 7 PM Boise game on Oct 30 (01:00 UTC on the 31st) → Oct 28, 3 PM MDT = 21:00 UTC.
    expect(computeDefaultScheduledAt('2026-10-31T01:00:00Z', now, 'America/Boise')).toBe('2026-10-28T21:00:00.000Z');
  });

  it('should fall back to tomorrow at 3 PM when two days before has passed', () => {
    expect(computeDefaultScheduledAt('2026-10-26T23:00:00Z', now, 'America/Boise')).toBe('2026-10-26T21:00:00.000Z');
  });

  it("should use UTC when the game's zone is unknown", () => {
    expect(computeDefaultScheduledAt('2026-10-30T18:00:00Z', now, null)).toBe('2026-10-28T15:00:00.000Z');
  });
});
