import type {
  AiScoutingCard,
  PersistedScoutingCard,
  ScoutingHitterStats,
  ScoutingPitcherStats,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

const TABLE = 'opponent_scouting_cards' as never;

interface ScoutingCardRow {
  id: string;
  opponent_team_id: string;
  team_id: string;
  ai_card: AiScoutingCard;
  hitter_stats: ScoutingHitterStats[];
  pitcher_stats: ScoutingPitcherStats[];
  game_sample_count: number;
  model: string;
  generated_by: string | null;
  generated_at: string;
}

export async function getLatestScoutingCard(
  supabase: TypedSupabaseClient,
  opponentTeamId: string,
  teamId: string,
): Promise<PersistedScoutingCard | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('opponent_team_id', opponentTeamId)
    .eq('team_id', teamId)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRow(data as unknown as ScoutingCardRow);
}

export async function insertScoutingCard(
  supabase: TypedSupabaseClient,
  args: {
    opponentTeamId: string;
    teamId: string;
    aiCard: AiScoutingCard;
    hitterStats: ScoutingHitterStats[];
    pitcherStats: ScoutingPitcherStats[];
    gameSampleCount: number;
    model: string;
    generatedBy: string;
  },
): Promise<PersistedScoutingCard> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(
      {
        opponent_team_id: args.opponentTeamId,
        team_id: args.teamId,
        ai_card: args.aiCard,
        hitter_stats: args.hitterStats,
        pitcher_stats: args.pitcherStats,
        game_sample_count: args.gameSampleCount,
        model: args.model,
        generated_by: args.generatedBy,
      } as never,
    )
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data as unknown as ScoutingCardRow);
}

function mapRow(r: ScoutingCardRow): PersistedScoutingCard {
  return {
    id: r.id,
    opponentTeamId: r.opponent_team_id,
    teamId: r.team_id,
    aiCard: r.ai_card,
    hitterStats: r.hitter_stats ?? [],
    pitcherStats: r.pitcher_stats ?? [],
    gameSampleCount: r.game_sample_count,
    model: r.model,
    generatedBy: r.generated_by ?? undefined,
    generatedAt: r.generated_at,
  };
}
