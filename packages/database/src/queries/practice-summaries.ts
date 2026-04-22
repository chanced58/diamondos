import type {
  AiConcern,
  AiPracticeSummary,
  AiStandoutPlayer,
  PersistedPracticeSummary,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const TABLE = 'practice_summaries' as never;

interface PracticeSummaryRow {
  id: string;
  practice_id: string;
  team_id: string;
  coach_recap: string;
  standout_players: AiStandoutPlayer[];
  concerns: AiConcern[];
  player_summaries: Record<string, string>;
  model: string;
  generated_by: string | null;
  generated_at: string;
}

export async function getPracticeSummary(
  supabase: TypedSupabaseClient,
  practiceId: string,
): Promise<PersistedPracticeSummary | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('practice_id', practiceId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRow(data as unknown as PracticeSummaryRow);
}

export async function upsertPracticeSummary(
  supabase: TypedSupabaseClient,
  args: {
    practiceId: string;
    teamId: string;
    summary: AiPracticeSummary;
    model: string;
    generatedBy: string;
  },
): Promise<PersistedPracticeSummary> {
  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        practice_id: args.practiceId,
        team_id: args.teamId,
        coach_recap: args.summary.coachRecap,
        standout_players: args.summary.standoutPlayers,
        concerns: args.summary.concerns,
        player_summaries: args.summary.playerSummaries,
        model: args.model,
        generated_by: args.generatedBy,
        generated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'practice_id' } as never,
    )
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data as unknown as PracticeSummaryRow);
}

function mapRow(r: PracticeSummaryRow): PersistedPracticeSummary {
  return {
    id: r.id,
    practiceId: r.practice_id,
    teamId: r.team_id,
    coachRecap: r.coach_recap,
    standoutPlayers: r.standout_players ?? [],
    concerns: r.concerns ?? [],
    playerSummaries: r.player_summaries ?? {},
    model: r.model,
    generatedBy: r.generated_by ?? undefined,
    generatedAt: r.generated_at,
  };
}
