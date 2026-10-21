const MAX_DEVICE_ID_LENGTH = 100;

/**
 * The phone's device id from a request body, recorded on the events a mobile
 * route appends; 'mobile' when absent or malformed.
 */
export function deviceIdFromBody(body: unknown): string {
  const deviceId = body && typeof body === 'object' ? (body as { deviceId?: unknown }).deviceId : undefined;
  return typeof deviceId === 'string' && deviceId.length > 0 && deviceId.length <= MAX_DEVICE_ID_LENGTH
    ? deviceId
    : 'mobile';
}
