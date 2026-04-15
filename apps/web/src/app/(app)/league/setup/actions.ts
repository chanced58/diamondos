'use server';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

type SetupInput = {
  leagueId: string;
  name: string;
  leagueType: string;
  level: string;
  stateCode: string | null;
  currentSeason: string;
  logoUrl: string | null;
  teamNames: string[];
  divisions: string[];
  teamDivisions: Record<string, string>;
};

export async function completeLeagueSetupAction(input: SetupInput): Promise<{ error?: string }> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return { error: 'Server configuration error' };

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  // Verify user is league staff for this league
  const { data: staffRow } = await db
    .from('league_staff')
    .select('role')
    .eq('league_id', input.leagueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!staffRow || staffRow.role !== 'league_admin') {
    return { error: 'You do not have access to this league' };
  }

  // Verify setup hasn't already been completed
  const { data: league } = await db
    .from('leagues')
    .select('setup_completed_at')
    .eq('id', input.leagueId)
    .single();

  if (league?.setup_completed_at) return { error: 'League setup has already been completed' };

  // Validate team names are all provided
  const cleanTeamNames = input.teamNames.map((n) => n.trim()).filter(Boolean);
  if (cleanTeamNames.length < 2) return { error: 'At least 2 team names are required' };

  // 1. Update the league row (without setup_completed_at — set only after all steps succeed)
  const { error: updateError } = await db
    .from('leagues')
    .update({
      name: input.name.trim(),
      league_type: input.leagueType,
      level: input.level,
      state_code: input.stateCode || null,
      current_season: input.currentSeason,
      logo_url: input.logoUrl,
    })
    .eq('id', input.leagueId);

  if (updateError) return { error: 'Failed to update league: ' + updateError.message };

  // 2. Create divisions (if provided)
  const divisionMap: Record<string, string> = {}; // division name → division id
  const cleanDivisions = input.divisions.map((d) => d.trim()).filter(Boolean);
  if (cleanDivisions.length > 0) {
    const { data: createdDivisions, error: divError } = await db
      .from('league_divisions')
      .insert(cleanDivisions.map((name) => ({ league_id: input.leagueId, name })))
      .select('id, name');

    if (divError) return { error: 'Failed to create divisions: ' + divError.message };
    for (const div of createdDivisions ?? []) {
      divisionMap[div.name] = div.id;
    }
  }

  // 3. Create opponent_teams (league-owned) and league_members for each team
  for (let i = 0; i < cleanTeamNames.length; i++) {
    const teamName = cleanTeamNames[i];

    // Create an opponent_team owned by the league (team_id is null)
    const { data: opponentTeam, error: otError } = await db
      .from('opponent_teams')
      .insert({
        name: teamName,
        league_id: input.leagueId,
      })
      .select('id')
      .single();

    if (otError) return { error: `Failed to create team "${teamName}": ${otError.message}` };

    // Resolve division assignment
    const assignedDivisionName = input.teamDivisions[String(i)];
    const divisionId = assignedDivisionName ? divisionMap[assignedDivisionName] ?? null : null;

    // Create league_members row linking the opponent_team to the league
    const { error: lmError } = await db
      .from('league_members')
      .insert({
        league_id: input.leagueId,
        opponent_team_id: opponentTeam.id,
        division_id: divisionId,
        is_active: true,
      });

    if (lmError) return { error: `Failed to add team "${teamName}" to league: ${lmError.message}` };
  }

  // 4. Create default League Announcements channel + add admin as member
  const { data: existingChannel } = await db
    .from('league_channels')
    .select('id')
    .eq('league_id', input.leagueId)
    .eq('channel_type', 'announcement')
    .limit(1)
    .maybeSingle();

  if (!existingChannel) {
    const { data: channel, error: channelError } = await db
      .from('league_channels')
      .insert({
        league_id: input.leagueId,
        channel_type: 'announcement',
        name: 'League Announcements',
        description: 'Official league announcements',
        created_by: user.id,
      })
      .select('id')
      .single();

    if (channelError) {
      console.error('Failed to create league announcements channel:', channelError.message);
      return { error: 'Failed to create announcements channel: ' + channelError.message };
    }

    if (channel) {
      const { error: memberError } = await db.from('league_channel_members').insert({
        league_channel_id: channel.id,
        user_id: user.id,
        can_post: true,
      });

      if (memberError) {
        console.error('Failed to add admin to announcements channel:', memberError.message);
        return { error: 'Failed to add admin to announcements channel: ' + memberError.message };
      }
    }
  }

  // Mark setup as complete only after all operations succeeded
  const { error: completeError } = await db
    .from('leagues')
    .update({ setup_completed_at: new Date().toISOString() })
    .eq('id', input.leagueId);

  if (completeError) return { error: 'Failed to finalize setup: ' + completeError.message };

  return {};
}
