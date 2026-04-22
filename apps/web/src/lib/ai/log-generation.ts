import 'server-only';
import { createClient } from '@supabase/supabase-js';

export type AiFeature =
  | 'practice_generator'
  | 'practice_summary'
  | 'scouting_card'
  | 'drill_recommendation';

export interface LogGenerationInput {
  feature: AiFeature;
  teamId?: string | null;
  userId: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
  latencyMs: number;
  status: 'success' | 'error';
  errorMessage?: string | null;
}

const ERROR_MESSAGE_MAX_CHARS = 1000;

/**
 * Strip obvious secrets and cap length before logging an error. Claude API
 * errors can echo back large payloads — we keep the message informative for
 * debugging but don't persist keys, emails, or stack dumps.
 */
function sanitizeErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let msg = raw
    // Strip anything shaped like an Anthropic API key.
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[redacted-api-key]')
    // Strip generic bearer tokens.
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    // Strip email addresses.
    .replace(
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
      '[redacted-email]',
    )
    // Collapse whitespace / stack traces.
    .replace(/\s+/g, ' ')
    .trim();
  if (msg.length > ERROR_MESSAGE_MAX_CHARS) {
    msg = msg.slice(0, ERROR_MESSAGE_MAX_CHARS - 1) + '…';
  }
  return msg;
}

/**
 * Fire-and-forget audit log. Failure to write is swallowed with a console
 * warning — logging must never break the user-facing request.
 */
export async function logAiGeneration(args: LogGenerationInput): Promise<void> {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { error } = await db.from('ai_generations').insert(
      {
        feature: args.feature,
        team_id: args.teamId ?? null,
        user_id: args.userId,
        model: args.model,
        input_tokens: args.usage?.inputTokens ?? 0,
        output_tokens: args.usage?.outputTokens ?? 0,
        cache_read_tokens: args.usage?.cacheReadTokens ?? 0,
        cache_creation_tokens: args.usage?.cacheCreationTokens ?? 0,
        latency_ms: args.latencyMs,
        status: args.status,
        error_message: sanitizeErrorMessage(args.errorMessage),
      } as never,
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[ai_generations] insert returned error:', error);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ai_generations] failed to log:', err);
  }
}
