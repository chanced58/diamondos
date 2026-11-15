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

/** After a refusal the server will keep giving, wait this long before trying again. */
const REJECTED_FLUSH_BACKOFF_MS = 10 * 60 * 1000;
const QUIET_FAILURE_KINDS = ['offline', 'timeout', 'unauthenticated'];
const BACKOFF_FAILURE_KINDS = ['not_found', 'forbidden', 'server'];

let nextFlushAllowedAt = 0;

/**
 * Removes exactly the entries that were sent, by content and count, not by
 * position: reports queued during the post may have pushed sent ones off the
 * front of a full queue, and those new reports must stay.
 */
async function removeSent(sent: ClientErrorEntry[]): Promise<void> {
  const remaining = new Map<string, number>();
  for (const entry of sent) {
    const key = JSON.stringify(entry);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }
  await withRegister(async () => {
    const kept = (await readQueue()).filter((entry) => {
      const key = JSON.stringify(entry);
      const count = remaining.get(key) ?? 0;
      if (count === 0) return true;
      remaining.set(key, count - 1);
      return false;
    });
    await writeQueue(kept);
  });
}

async function sendQueued(): Promise<void> {
  const entries = (await withRegister(readQueue)).slice(0, CLIENT_ERROR_BATCH_MAX);
  if (entries.length === 0) return;
  try {
    await apiClient.post('/client-errors', { entries });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (QUIET_FAILURE_KINDS.includes(error.kind)) return; // no signal or signed out: the reports wait
    if (error.kind === 'invalid') {
      // The server will never take this batch; drop it rather than resend it forever.
      console.warn('error-report: server refused queued error reports; dropping them', error);
      await removeSent(entries);
      return;
    }
    if (BACKOFF_FAILURE_KINDS.includes(error.kind)) {
      nextFlushAllowedAt = Date.now() + REJECTED_FLUSH_BACKOFF_MS;
    }
    throw error;
  }
  await removeSent(entries);
}

/**
 * Sends the queued reports. On a failure the queue is kept for the next try,
 * except a batch the server refuses as invalid, which is dropped; a missing
 * route, a refusal or a server error holds off flushing for 10 minutes. The
 * failure itself is never reported (that would only queue another report
 * that cannot be sent either).
 */
export function flushClientErrors(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  if (Date.now() < nextFlushAllowedAt) return Promise.resolve();
  flushInFlight = sendQueued()
    .catch((error: unknown) => {
      console.warn('error-report: could not send queued error reports', error);
    })
    .finally(() => {
      flushInFlight = null;
    });
  return flushInFlight;
}
