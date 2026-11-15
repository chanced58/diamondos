import {
  CLIENT_ERROR_BATCH_MAX,
  clientErrorEntrySchema,
  errorMessageOf,
  sanitizeErrorDetails,
  type ClientErrorEntry,
} from '@baseball/shared';
import { database } from '../db';
import { ApiError, apiClient } from './api-client';
import { APP_VERSION } from './app-version';
import { getDeviceId } from './device-id';
import { enqueueError, ERROR_QUEUE_KEY, parseErrorQueue } from './error-queue';

export interface ClientErrorContext {
  teamId?: string;
  gameId?: string;
  details?: Record<string, unknown>;
}

const EMPTY_MESSAGE = '[no message]';

// Every register read-modify-write runs on this chain, one after another, so
// two reports in quick succession (or a report during a flush) never
// overwrite each other.
let registerChain: Promise<unknown> = Promise.resolve();
let flushInFlight: Promise<void> | null = null;

function withRegister<T>(work: () => Promise<T>): Promise<T> {
  const run = registerChain.then(work, work);
  registerChain = run.catch(() => undefined);
  return run;
}

async function readQueue(): Promise<ClientErrorEntry[]> {
  return parseErrorQueue(await database.localStorage.get<string>(ERROR_QUEUE_KEY));
}

async function writeQueue(queue: ClientErrorEntry[]): Promise<void> {
  await database.localStorage.set(ERROR_QUEUE_KEY, JSON.stringify(queue));
}

function validUuid(value: string | undefined): string | undefined {
  return clientErrorEntrySchema.shape.gameId.safeParse(value).success ? value : undefined;
}

/** Builds an entry the server accepts, dropping any field it would refuse. */
function buildEntry(area: string, error: unknown, context: ClientErrorContext | undefined, deviceId: string | undefined): ClientErrorEntry {
  const entry: ClientErrorEntry = {
    area: area.slice(0, 64),
    message: errorMessageOf(error) || EMPTY_MESSAGE,
    details: sanitizeErrorDetails(context?.details),
    occurredAt: new Date().toISOString(),
  };
  if (APP_VERSION) entry.appVersion = APP_VERSION.slice(0, 32);
  if (deviceId) entry.deviceId = deviceId.slice(0, 64);
  const teamId = validUuid(context?.teamId);
  if (teamId) entry.teamId = teamId;
  const gameId = validUuid(context?.gameId);
  if (gameId) entry.gameId = gameId;
  return entry;
}

/**
 * Queues an error report for the next flush. Returns at once and never
 * throws: callers include the scoring write path, which must not fail or
 * slow down because a report could not be stored.
 */
export function reportClientError(area: string, error: unknown, context?: ClientErrorContext): void {
  try {
    getDeviceId()
      .catch(() => undefined)
      .then((deviceId) => {
        const entry = buildEntry(area, error, context, deviceId);
        return withRegister(async () => writeQueue(enqueueError(await readQueue(), entry)));
      })
      .catch((storeError: unknown) => {
        console.warn('error-report: could not queue an error report', area, storeError);
      });
  } catch (unexpected) {
    console.warn('error-report: could not queue an error report', area, unexpected);
  }
}

async function sendQueued(): Promise<void> {
  const entries = (await withRegister(readQueue)).slice(0, CLIENT_ERROR_BATCH_MAX);
  if (entries.length === 0) return;
  await apiClient.post('/client-errors', { entries });
  // Remove exactly what was sent: a report queued while the post was in
  // flight stays for the next flush.
  await withRegister(async () => writeQueue((await readQueue()).slice(entries.length)));
}

/**
 * Sends the queued reports. On any failure the queue is left as it was for
 * the next try, and the failure itself is not reported (that would only
 * queue another report that cannot be sent either).
 */
export function flushClientErrors(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = sendQueued()
    .catch((error: unknown) => {
      // No signal at the field, or signed out, is expected; the reports wait.
      if (error instanceof ApiError && ['offline', 'timeout', 'unauthenticated'].includes(error.kind)) return;
      console.warn('error-report: could not send queued error reports', error);
    })
    .finally(() => {
      flushInFlight = null;
    });
  return flushInFlight;
}
