import type { SupabaseClient } from '@supabase/supabase-js';
import { isDualScorekeeperEnabled, weAreHome, type LeagueScoringSettings } from '@baseball/shared';
import { getLeagueSettingsForTeam } from '@/lib/league-settings';

interface CreatedGame {
  id: string;
  team_id: string;
  opponent_team_id: string | null;
  scheduled_at: string;
  location_type: string;
  neutral_home_team: string | null;
  venue_name: string | null;
  season_id: string | null;
  paired_game_id?: string | null;
}

/**
 * When a league has dual scorekeeper enabled and the new game's opponent is a
 * linked DiamondOS team, auto-create the opponent's parallel ("mirror") game
 * so their scorekeeper can score the same matchup on their own row.
 *
 * The two rows are cross-linked via paired_game_id, and each row records which
 * side it scores (scorer_side). The home team's row is canonical. This is a
 * best-effort side effect: any failure is logged and swallowed so it never
 * blocks game creation. Must be called with a service-role client because it
 * inserts a row owned by a different team.
 *
 * @returns the mirror game id when one was created, otherwise null.
 */
export async function provisionMirrorGame(
  db: SupabaseClient,
  game: CreatedGame,
  createdBy: string,
  settings?: LeagueScoringSettings,
): Promise<string | null> {
  try {
    // Already paired (e.g. re-run) — nothing to do.
    if (game.paired_game_id) return null;
    if (!game.opponent_team_id) return null;

    const resolved = settings ?? (await getLeagueSettingsForTeam(db, game.team_id));
    if (!isDualScorekeeperEnabled(resolved)) return null;

    // The opponent must be a linked platform team for the other side to score.
    const { data: opp } = await db
      .from('opponent_teams')
      .select('linked_team_id')
      .eq('id', game.opponent_team_id)
      .maybeSingle();
    const linkedTeamId = opp?.linked_team_id ?? null;
    if (!linkedTeamId) return null;

    // Guard against duplicates: if a mirror already points back at this game.
    const { data: existing } = await db
      .from('games')
      .select('id')
      .eq('paired_game_id', game.id)
      .maybeSingle();
    if (existing?.id) return existing.id;

    const originalIsHome = weAreHome(game.location_type, game.neutral_home_team);

    // Mirror the location for the opponent's perspective.
    const mirrorLocationType =
      game.location_type === 'neutral'
        ? 'neutral'
        : originalIsHome
          ? 'away'
          : 'home';
    const mirrorNeutralHomeTeam =
      game.location_type === 'neutral'
        ? game.neutral_home_team === 'opponent'
          ? 'us'
          : 'opponent'
        : null;

    // Name the mirror's opponent (= the original home team) and resolve the
    // linked team's active season for stat attribution.
    const [{ data: homeTeam }, { data: linkedSeason }] = await Promise.all([
      db.from('teams').select('name').eq('id', game.team_id).maybeSingle(),
      db
        .from('seasons')
        .select('id')
        .eq('team_id', linkedTeamId)
        .eq('is_active', true)
        .maybeSingle(),
    ]);

    const { data: mirror, error: mirrorErr } = await db
      .from('games')
      .insert({
        team_id: linkedTeamId,
        opponent_name: homeTeam?.name ?? 'Opponent',
        opponent_team_id: null,
        scheduled_at: game.scheduled_at,
        location_type: mirrorLocationType,
        neutral_home_team: mirrorNeutralHomeTeam,
        venue_name: game.venue_name,
        season_id: linkedSeason?.id ?? null,
        paired_game_id: game.id,
        scorer_side: originalIsHome ? 'away' : 'home',
        created_by: createdBy,
      })
      .select('id')
      .single();

    if (mirrorErr || !mirror) {
      console.error(
        `[dual-scorekeeper] mirror insert failed game=${game.id}: ${mirrorErr?.message ?? 'no row'}`,
      );
      return null;
    }

    const { error: linkErr } = await db
      .from('games')
      .update({
        paired_game_id: mirror.id,
        scorer_side: originalIsHome ? 'home' : 'away',
      })
      .eq('id', game.id);

    if (linkErr) {
      console.error(
        `[dual-scorekeeper] back-link failed game=${game.id} mirror=${mirror.id}: ${linkErr.message}`,
      );
    }

    return mirror.id;
  } catch (err) {
    console.error(
      `[dual-scorekeeper] provisionMirrorGame threw game=${game.id}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
