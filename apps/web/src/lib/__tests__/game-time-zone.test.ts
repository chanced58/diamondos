import { resolveGameTimeZone } from '../games/game-time-zone';

describe('resolveGameTimeZone', () => {
  it('uses the venue zone when the coach picked an address', () => {
    // Tempe Diablo Stadium — the coach's browser being elsewhere must not matter.
    expect(
      resolveGameTimeZone({ latitude: 33.4007815, longitude: -111.9709335, browserTimeZone: 'America/Boise' }),
    ).toBe('America/Phoenix');
  });

  it('keeps the saved zone on edit when the venue has no coordinates', () => {
    expect(
      resolveGameTimeZone({ latitude: null, longitude: null, existingTimeZone: 'America/Phoenix', browserTimeZone: 'America/Boise' }),
    ).toBe('America/Phoenix');
  });

  it("falls back to the coach's browser zone without a venue", () => {
    expect(resolveGameTimeZone({ latitude: null, longitude: null, browserTimeZone: 'America/Boise' })).toBe('America/Boise');
  });

  it('ignores junk zones and bad coordinates, ending at UTC', () => {
    expect(
      resolveGameTimeZone({ latitude: Number.NaN, longitude: 200, existingTimeZone: 'nope', browserTimeZone: '' }),
    ).toBe('UTC');
  });
});
