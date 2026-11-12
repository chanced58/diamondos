/**
 * A readable one-line description of anything a sync step can throw.
 *
 * Supabase hands back PostgREST errors as plain objects (`{ message, code,
 * details, hint }`), not `Error`s, so `String(error)` printed
 * `[object Object]` and the actual refusal (an RLS policy, a missing
 * function) never reached the log. The code, details and hint are kept
 * because the message alone often doesn't say which row or policy failed.
 */
export function describeSyncError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const fields = error as Record<string, unknown>;
    const text = (key: string) => (typeof fields[key] === 'string' && fields[key] !== '' ? (fields[key] as string) : null);
    const parts: string[] = [];
    const message = text('message');
    if (message) parts.push(message);
    const code = text('code');
    if (code) parts.push(`(code ${code})`);
    const details = text('details');
    if (details) parts.push(`details: ${details}`);
    const hint = text('hint');
    if (hint) parts.push(`hint: ${hint}`);
    if (parts.length > 0) return parts.join(' ');
    if (error instanceof Error) return error.name;
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {
      // Circular or otherwise unserializable: fall through.
    }
  }
  return String(error);
}

/** `error` as an `Error` whose message is {@link describeSyncError}'s. */
export function toSyncError(error: unknown): Error {
  if (error instanceof Error && error.message) return error;
  return new Error(describeSyncError(error));
}
