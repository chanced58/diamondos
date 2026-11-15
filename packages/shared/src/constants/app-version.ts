/**
 * Mobile app version gate. `/me` sends these so the app can ask the user to
 * update. Raise MIN_SUPPORTED_MOBILE_VERSION to start warning older builds.
 */
export const MIN_SUPPORTED_MOBILE_VERSION = '1.0.0';

/** The app is distributed through TestFlight only; this opens it. */
export const MOBILE_APP_UPDATE_URL = 'itms-beta://';

/** Leading dot-separated numeric parts of a version, ignoring any `-`/`+` suffix. */
function numericParts(version: string): number[] {
  const core = version.trim().split(/[-+]/)[0] ?? '';
  const match = core.match(/^\d+(?:\.\d+)*/);
  if (!match) return [];
  return match[0].split('.').map((part) => Number.parseInt(part, 10));
}

/**
 * Negative, 0 or positive as `a` is older than, equal to or newer than `b`.
 * Missing parts count as 0 and suffixes are ignored. Never throws.
 */
export function compareAppVersions(a: string, b: string): number {
  const partsA = numericParts(a);
  const partsB = numericParts(b);
  const length = Math.max(partsA.length, partsB.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (partsA[index] ?? 0) - (partsB[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** True when either version is missing or has no numeric part (never block on doubt). */
export function isAppVersionSupported(
  current: string | null | undefined,
  minimum: string | null | undefined,
): boolean {
  if (!current || !minimum) return true;
  if (numericParts(current).length === 0 || numericParts(minimum).length === 0) return true;
  return compareAppVersions(current, minimum) >= 0;
}
