import { z } from 'zod';

export const ERROR_MESSAGE_MAX = 2000;
export const ERROR_DETAILS_MAX_BYTES = 8192;
export const CLIENT_ERROR_BATCH_MAX = 50;
export const CLIENT_ERROR_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const SECRET_KEY_PATTERN = /token|authorization|password|secret|cookie|email|apikey|api_key/i;
const UNSERIALIZABLE = '[unserializable]';

export const clientErrorEntrySchema = z.object({
  area: z.string().min(1).max(64),
  message: z.string().min(1).max(ERROR_MESSAGE_MAX),
  details: z.record(z.unknown()).optional(),
  occurredAt: z.string().datetime(),
  appVersion: z.string().max(32).optional(),
  deviceId: z.string().max(64).optional(),
  teamId: z.string().uuid().optional(),
  gameId: z.string().uuid().optional(),
});

export const clientErrorBatchSchema = z.object({
  entries: z.array(clientErrorEntrySchema).min(1).max(CLIENT_ERROR_BATCH_MAX),
});

export type ClientErrorEntry = z.infer<typeof clientErrorEntrySchema>;
export type ClientErrorBatch = z.infer<typeof clientErrorBatchSchema>;

function sanitizeValue(value: unknown, ancestors: unknown[]): unknown {
  if (value === null) return null;
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return value;
  if (kind !== 'object') return kind === 'undefined' ? undefined : UNSERIALIZABLE;
  if (value instanceof Error) return errorMessageOf(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[invalid date]' : value.toISOString();
  if (ancestors.includes(value)) return '[circular]';
  const path = [...ancestors, value];
  if (Array.isArray(value)) return value.map((item) => sanitizeEntry(() => item, path));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as object)) {
    if (SECRET_KEY_PATTERN.test(key)) continue;
    out[key] = sanitizeEntry(() => (value as Record<string, unknown>)[key], path);
  }
  return out;
}

function sanitizeEntry(read: () => unknown, ancestors: unknown[]): unknown {
  try {
    return sanitizeValue(read(), ancestors);
  } catch {
    return UNSERIALIZABLE;
  }
}

/** Strips secrets, cycles and oversized payloads from error details. Never throws. */
export function sanitizeErrorDetails(details: unknown): Record<string, unknown> {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return {};
  try {
    const sanitized = sanitizeValue(details, []) as Record<string, unknown>;
    const json = JSON.stringify(sanitized);
    if (new TextEncoder().encode(json).length > ERROR_DETAILS_MAX_BYTES) return { truncated: true };
    return sanitized;
  } catch {
    return { truncated: true };
  }
}

export function errorMessageOf(error: unknown): string {
  let message: string;
  try {
    message = error instanceof Error ? String(error.message) : typeof error === 'string' ? error : String(error);
  } catch {
    message = '[unreadable error]';
  }
  return message.slice(0, ERROR_MESSAGE_MAX);
}
