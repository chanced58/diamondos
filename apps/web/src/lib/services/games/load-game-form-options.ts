import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { GameFormOptions } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { activeLeagueIds, isActiveTeamCoach, isPlatformAdmin } from './game-form-helpers';

const inputSchema = z.object({ teamId: z.string().uuid('Missing team ID.') });

type OpponentTeam = GameFormOptions['opponentTeams'][number];

function loadFailed(what: string, teamId: string, error: { message: string }): ServiceResult<GameFormOptions> {
  console.error(`[loadGameFormOptions] ${what} lookup failed team=${teamId}:`, error);
  return serviceError('failed', `Failed to load ${what}: ${error.message}`);
}

/**
 * What the game form offers: the opponent teams a coach may pick — the
 * team's own records plus its league's — deduplicated and sorted by name.
 */
export async function loadGameFormOptions(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<GameFormOptions>> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId } = parsed.data;

  const allowed = (await isPlatformAdmin(db, actorUserId)) || (await isActiveTeamCoach(db, actorUserId, teamId));
  if (!allowed) return serviceError('forbidden', 'Only coaches can schedule games.');

  // A failed query fails the whole load: a partial list would read as the
  // team's complete set of opponents.
  const { data: teamOpponents, error: teamOpponentsError } = await db
    .from('opponent_teams')
    .select('id, name, city')
    .eq('team_id', teamId)
    .order('name');
  if (teamOpponentsError) return loadFailed('team opponents', teamId, teamOpponentsError);

  // The same rule as isOpponentTeamAvailable: active opponents of every league
  // the team is actively in, so the form never offers one the save rejects.
  let leagueOpponents: OpponentTeam[] = [];
  const leagues = await activeLeagueIds(db, teamId);
  if (!leagues.ok) return leagues;
  if (leagues.data.length > 0) {
    const { data: leagueMembers, error: leagueMembersError } = await db
      .from('league_members')
      .select('opponent_team_id, opponent_teams(id, name, city)')
      .in('league_id', leagues.data)
      .eq('is_active', true)
      .not('opponent_team_id', 'is', null);
    if (leagueMembersError) return loadFailed('league opponents', teamId, leagueMembersError);
    leagueOpponents = (leagueMembers ?? []).flatMap((member) => {
      const raw = member.opponent_teams as unknown;
      const team = (Array.isArray(raw) ? raw[0] : raw) as OpponentTeam | null;
      return team ? [{ id: team.id, name: team.name, city: team.city ?? null }] : [];
    });
  }

  const byId = new Map<string, OpponentTeam>();
  for (const team of [...((teamOpponents ?? []) as OpponentTeam[]), ...leagueOpponents]) {
    byId.set(team.id, { id: team.id, name: team.name, city: team.city ?? null });
  }
  const opponentTeams = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return serviceOk({ opponentTeams });
}
