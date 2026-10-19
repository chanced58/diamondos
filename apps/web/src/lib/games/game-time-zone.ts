import tzLookup from '@photostructure/tz-lookup';
import { isValidTimeZone } from '@baseball/shared';

type GameTimeZoneInputs = {
  /** Venue coordinates from AddressAutocomplete, when the coach picked an address. */
  latitude: number | null;
  longitude: number | null;
  /** The game's saved zone, kept on edit when the venue has no coordinates. */
  existingTimeZone?: string | null;
  /** `Intl` zone of the browser the form was submitted from. */
  browserTimeZone?: string | null;
};

function venueTimeZone(latitude: number | null, longitude: number | null): string | null {
  if (latitude == null || longitude == null) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  try {
    return tzLookup(latitude, longitude);
  } catch (err) {
    console.error('[game-time-zone] venue lookup failed', { latitude, longitude, err });
    return null;
  }
}

/**
 * The zone a game's typed start time means: the venue's zone, else the zone
 * already saved on the game, else the coach's browser. The server itself runs
 * in UTC, so it is never a sensible default — UTC is the last resort only.
 */
export function resolveGameTimeZone(inputs: GameTimeZoneInputs): string {
  const venue = venueTimeZone(inputs.latitude, inputs.longitude);
  if (venue) return venue;
  if (isValidTimeZone(inputs.existingTimeZone)) return inputs.existingTimeZone;
  if (isValidTimeZone(inputs.browserTimeZone)) return inputs.browserTimeZone;
  return 'UTC';
}
