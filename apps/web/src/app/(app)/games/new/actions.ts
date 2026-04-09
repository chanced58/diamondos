'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { formatDate, formatTime } from '@baseball/shared';
import { postEventAlert } from '@/app/(app)/messages/notify';

export async function createGameAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId       = formData.get('teamId') as string;
  const opponent     = (formData.get('opponent') as string)?.trim();
  const opponentTeamId = (formData.get('opponentTeamId') as string)?.trim() || null;
  const date         = formData.get('date') as string;
  const time         = (formData.get('time') as string) || '12:00';
  const locationType = (formData.get('locationType') as string) || 'home';
  const venue        = (formData.get('venue') as string)?.trim() || null;
  const neutralHomeTeam = locationType === 'neutral'
    ? ((formData.get('neutralHomeTeam') as string) || 'us')
    : null;
  const notes        = (formData.get('notes') as string)?.trim() || null;

  // Structured address fields from AddressAutocomplete
  const address   = (formData.get('venue_address') as string)   || null;
  const latRaw    = formData.get('venue_latitude') as string;
  const lngRaw    = formData.get('venue_longitude') as string;
  const placeId   = (formData.get('venue_place_id') as string)  || null;
  const latitude  = latRaw  ? parseFloat(latRaw)  : null;
  const longitude = lngRaw  ? parseFloat(lngRaw)  : null;

  if (!teamId)    return 'Missing team ID.';
  if (!opponent)  return 'Opponent name is required.';
  if (!date)      return 'Game date is required.';

  const scheduledAt = new Date(`${date}T${time}`).toISOString();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify coach role
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can schedule games.';

  // Validate opponentTeamId belongs to this team or the team's league
  let validatedOpponentTeamId: string | null = null;
  if (opponentTeamId) {
    const { data: opponentTeam, error: otError } = await supabase
      .from('opponent_teams')
      .select('id, team_id')
      .eq('id', opponentTeamId)
      .single();

    if (otError || !opponentTeam) return 'Selected opponent team not found.';

    // Must belong to this team directly...
    const ownedByTeam = opponentTeam.team_id === teamId;

    // ...or be accessible via a shared league (opponent team is a league member,
    // and this team is also a member of that same league)
    let inSameLeague = false;
    if (!ownedByTeam) {
      const { data: sharedLeague } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('opponent_team_id', opponentTeamId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (sharedLeague) {
        const { data: teamMembership } = await supabase
          .from('league_members')
          .select('id')
          .eq('league_id', sharedLeague.league_id)
          .eq('team_id', teamId)
          .eq('is_active', true)
          .maybeSingle();
        inSameLeague = !!teamMembership;
      }
    }

    if (!ownedByTeam && !inSameLeague) {
      return 'Selected opponent team does not belong to your team or league.';
    }
    validatedOpponentTeamId = opponentTeam.id;
  }

  // Look up active season so the game is automatically linked
  const { data: activeSeason } = await supabase
    .from('seasons')
    .select('id')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();

  const { data: game, error } = await supabase
    .from('games')
    .insert({
      team_id:       teamId,
      opponent_name: opponent,
      opponent_team_id: validatedOpponentTeamId,
      scheduled_at:  scheduledAt,
      location_type:     locationType,
      neutral_home_team: neutralHomeTeam,
      venue_name:        venue,
      address,
      latitude,
      longitude,
      place_id:      placeId,
      notes,
      created_by:    user.id,
      season_id:     activeSeason?.id ?? null,
    })
    .select()
    .single();

  if (error) return `Failed to create game: ${error.message}`;

  if (formData.get('notifyTeam') === 'on') {
    const locationLabel =
      locationType === 'home' ? 'Home' : locationType === 'away' ? 'Away' : 'Neutral site';
    const msg = `📅 New game scheduled: vs. ${opponent} — ${formatDate(scheduledAt)} at ${formatTime(scheduledAt)} (${locationLabel})`;
    await postEventAlert(supabase, teamId, user.id, msg);
  }

  redirect(`/games/${game.id}`);
}
