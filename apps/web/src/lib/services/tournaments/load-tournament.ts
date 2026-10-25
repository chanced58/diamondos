import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Feature,
  hasFeature,
  mergeWithDefaults,
  tournamentDetailInputSchema,
  type TournamentDetailResponse,
} from '@baseball/shared';
import { loadTournamentPlayerStats } from '@/lib/tournament-player-stats';
import { statTierForLevel } from '@/lib/stats/load-season-stats';
import { resolveTeamTier } from '@/lib/team-tier';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { toBattingRow, toPitchingRow } from '../stats/wire';

/**
 * One tournament for the mobile app (the web /tournaments/:id page): its team,
 * lineup rules, games and the team's batting and pitching lines from scored
 * tournament games. Read with the service role, so the viewer must be on the
 * tournament's team (or a platform admin) — the people the web page's RLS
 * reads show it to; anyone else gets not found.
 */

type TournamentRow = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  scoring_settings: unknown;
  tournament_teams: Array<{ team_id: string; season_id: string; teams: { name: string; level: string | null } | Array<{ name: string; level: string | null }> | null }>;
};

/** The tournament as its team's members see it. */
export async function loadTournament(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<TournamentDetailResponse>> {
  const parsed = tournamentDetailInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { tournamentId } = parsed.data;

  try {
    const { data, error } = await db
      .from('tournaments')
      .select('id, name, start_date, end_date, status, scoring_settings, tournament_teams(team_id, season_id, teams(name, level))')
      .eq('id', tournamentId)
      .maybeSingle();
    if (error) throw error;
    const tournament = data as TournamentRow | null;
    const participant = tournament?.tournament_teams[0];
    if (!tournament || !participant) return serviceError('not_found', 'Tournament not found.');

    const viewer = await resolveGameViewer(db, actorUserId, participant.team_id);
    if (!viewer) return serviceError('not_found', 'Tournament not found.');

    const team = Array.isArray(participant.teams) ? participant.teams[0] : participant.teams;
    const [games, stats, subscriptionTier] = await Promise.all([
      db
        .from('games')
        .select('id, opponent_name, scheduled_at, time_zone, status')
        .eq('tournament_id', tournamentId)
        .eq('team_id', participant.team_id)
        .order('scheduled_at'),
      loadTournamentPlayerStats(db, { tournamentId, teamId: participant.team_id, seasonId: participant.season_id }),
      resolveTeamTier(db, participant.team_id),
    ]);
    if (games.error) throw games.error;

    const { lineup } = mergeWithDefaults(tournament.scoring_settings);
    return serviceOk({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        startDate: tournament.start_date,
        endDate: tournament.end_date,
        status: tournament.status,
      },
      team: { id: participant.team_id, name: team?.name ?? 'Team' },
      lineupRules: {
        allowExpanded: lineup.allowExpanded,
        maxBatters: lineup.maxBatters,
        allowMidGameExtension: lineup.allowMidGameExtension,
        allowMidGameContraction: lineup.allowMidGameContraction,
      },
      games: ((games.data ?? []) as Array<{ id: string; opponent_name: string | null; scheduled_at: string; time_zone: string | null; status: string }>).map(
        (g) => ({ id: g.id, opponentName: g.opponent_name, scheduledAt: g.scheduled_at, timeZone: g.time_zone, status: g.status }),
      ),
      scoredGameCount: stats.scoredGameCount,
      batting: stats.batting.map(toBattingRow),
      pitching: stats.pitching.map(toPitchingRow),
      defaultTier: statTierForLevel(team?.level ?? null),
      features: {
        advancedBatting: hasFeature(subscriptionTier, Feature.ADVANCED_BATTING_STATS),
        advancedPitching: hasFeature(subscriptionTier, Feature.ADVANCED_PITCHING_STATS),
      },
      canAddGame: viewer.isCoach,
    });
  } catch (error) {
    console.error(`[loadTournament] tournament=${tournamentId} actor=${actorUserId} failed:`, error);
    return serviceError('failed', 'Something went wrong. Please try again.');
  }
}
