import type { SupabaseClient } from '@supabase/supabase-js';
import { reportError } from '@/lib/errors/report-error';

export interface PushInput {
  userIds: string[];
  title: string;
  body: string;
  /** Deep-link data; the mobile app routes taps on `data.kind`. */
  data?: Record<string, unknown>;
}

/**
 * Send a push notification through the `push-notifications` edge function.
 * Best-effort: a failure is logged and never thrown, so a notification can't
 * break the write that triggered it.
 */
export async function sendPush(db: SupabaseClient, input: PushInput): Promise<void> {
  if (input.userIds.length === 0) return;
  try {
    const { error } = await db.functions.invoke('push-notifications', pushInvokeOptions(input));
    if (error) {
      console.error(`[sendPush] push-notifications failed title="${input.title}" users=${input.userIds.length}:`, error);
      reportError('push.send', error, { details: pushDetails(input) });
    }
  } catch (error) {
    console.error(`[sendPush] push-notifications threw title="${input.title}" users=${input.userIds.length}:`, error);
    reportError('push.send', error, { details: pushDetails(input) });
  }
}

/**
 * The edge function accepts only internal callers: the service-role bearer the
 * client already sends, or `x-internal-secret` when INTERNAL_JOB_SECRET is set.
 */
function pushInvokeOptions(input: PushInput): { body: PushInput; headers?: Record<string, string> } {
  const internalSecret = process.env.INTERNAL_JOB_SECRET;
  if (!internalSecret) return { body: input };
  return { body: input, headers: { 'x-internal-secret': internalSecret } };
}

function pushDetails(input: PushInput): Record<string, unknown> {
  return { title: input.title, recipients: input.userIds.length, kind: input.data?.kind };
}
