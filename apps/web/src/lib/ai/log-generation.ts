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
    await db.from('ai_generations').insert(
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
        error_message: args.errorMessage ?? null,
      } as never,
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ai_generations] failed to log:', err);
  }
}
