import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { GameFormOptions } from '@baseball/shared';
import { getLeagueForTeam } from '@baseball/database';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { isActiveTeamCoach, isPlatformAdmin } from './game-form-helpers';

const inputSchema = z.object({ teamId: z.string().uuid('Missing team ID.') });

type OpponentTeam = GameFormOptions['opponentTeams'][number];

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

  const { data: teamOpponents } = await db
    .from('opponent_teams')
    .select('id, name, city')
    .eq('team_id', teamId)
    .order('name');

  let leagueOpponents: OpponentTeam[] = [];
  const league = await getLeagueForTeam(db as never, teamId);
  if (league) {
    const { data: leagueMembers } = await db
      .from('league_members')
      .select('opponent_team_id, opponent_teams(id, name, city)')
      .eq('league_id', league.id)
      .not('opponent_team_id', 'is', null);
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
