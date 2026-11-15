/**
 * Records an edge function failure in `public.app_error_log` (source 'edge').
 * Best-effort: it never throws, so reporting can't break the function.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_MESSAGE_LENGTH = 2000;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export async function reportEdgeError(
  supabase: SupabaseClient,
  area: string,
  error: unknown,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const message = (errorMessage(error) || 'Unknown error').slice(0, MAX_MESSAGE_LENGTH);
    const { error: insertError } = await supabase.from('app_error_log').insert({
      source: 'edge',
      area,
      message,
      details: details ?? {},
    });
    if (insertError) console.error(`reportEdgeError: insert failed area=${area}`, insertError);
  } catch (reportFailure) {
    console.error(`reportEdgeError: threw area=${area}`, reportFailure);
  }
}
