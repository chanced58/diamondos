-- Row Level Security (RLS) policies for all tables
-- This is the primary security enforcement layer. Never bypass with client-side checks only.

-- Enable RLS on every app table
alter table public.user_profiles         enable row level security;
alter table public.teams                 enable row level security;
alter table public.seasons               enable row level security;
alter table public.team_members          enable row level security;
alter table public.players               enable row level security;
alter table public.parent_player_links   enable row level security;
alter table public.season_rosters        enable row level security;
alter table public.games                 enable row level security;
alter table public.game_lineups          enable row level security;
alter table public.game_events           enable row level security;
alter table public.pitch_counts          enable row level security;
alter table public.channels              enable row level security;
alter table public.channel_members       enable row level security;
alter table public.messages              enable row level security;
alter table public.game_rsvps            enable row level security;
alter table public.push_tokens           enable row level security;
alter table public.pitch_compliance_rules enable row level security;
alter table public.season_compliance_rules enable row level security;

-- ─── user_profiles ───────────────────────────────────────────────────────────

create policy "users_view_own_profile"
  on public.user_profiles for select
  using (id = auth.uid());

create policy "team_members_view_co_member_profiles"
  on public.user_profiles for select
  using (
    exists (
      select 1 from public.team_members tm1
      join public.team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid()
        and tm2.user_id = public.user_profiles.id
        and tm1.is_active = true
        and tm2.is_active = true
    )
  );

create policy "users_update_own_profile"
  on public.user_profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ─── teams ───────────────────────────────────────────────────────────────────

create policy "team_members_view_team"
  on public.teams for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.teams.id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_update_team"
  on public.teams for update
  using (public.is_coach(id, auth.uid()));

-- Team creation is handled server-side (service role) when a user onboards
-- No client-side INSERT policy; use edge function for team creation

-- ─── seasons ─────────────────────────────────────────────────────────────────

create policy "team_members_view_seasons"
  on public.seasons for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.seasons.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_seasons"
  on public.seasons for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

-- ─── team_members ─────────────────────────────────────────────────────────────

-- Uses get_team_role() (SECURITY DEFINER) to avoid infinite recursion from
-- a self-referential subquery on team_members.
create policy "team_members_view_membership"
  on public.team_members for select
  using (public.get_team_role(team_id, auth.uid()) is not null);

-- Only service role (edge functions) may insert/update team_members (invitation flow)

-- ─── players ─────────────────────────────────────────────────────────────────

create policy "team_members_view_players"
  on public.players for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.players.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_players"
  on public.players for insert
  with check (public.is_coach(team_id, auth.uid()));

create policy "coaches_update_players"
  on public.players for update
  using (public.is_coach(team_id, auth.uid()));

-- ─── parent_player_links ──────────────────────────────────────────────────────

create policy "parents_view_own_links"
  on public.parent_player_links for select
  using (parent_user_id = auth.uid());

create policy "coaches_view_player_links"
  on public.parent_player_links for select
  using (
    exists (
      select 1 from public.players p
      join public.team_members tm on tm.team_id = p.team_id
      where p.id = public.parent_player_links.player_id
        and tm.user_id = auth.uid()
        and tm.role in ('head_coach', 'assistant_coach', 'athletic_director')
        and tm.is_active = true
    )
  );

-- ─── season_rosters ───────────────────────────────────────────────────────────

create policy "team_members_view_season_rosters"
  on public.season_rosters for select
  using (
    exists (
      select 1 from public.seasons s
      join public.team_members tm on tm.team_id = s.team_id
      where s.id = public.season_rosters.season_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_season_rosters"
  on public.season_rosters for all
  using (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_rosters.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_rosters.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  );

-- ─── games ────────────────────────────────────────────────────────────────────

create policy "team_members_view_games"
  on public.games for select
  using (
    exists (
      select 1 from public.team_members
      where team_id = public.games.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_games"
  on public.games for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

-- Public read for live score page (no auth)
create policy "public_view_in_progress_games"
  on public.games for select
  using (status = 'in_progress');

-- ─── game_lineups ─────────────────────────────────────────────────────────────

create policy "team_members_view_lineups"
  on public.game_lineups for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_lineups.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_lineups"
  on public.game_lineups for all
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_lineups.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.games g
      where g.id = public.game_lineups.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

-- ─── game_events (immutable append-only) ──────────────────────────────────────

create policy "team_members_view_game_events"
  on public.game_events for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_events.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- Public read for live score page
create policy "public_view_events_for_live_games"
  on public.game_events for select
  using (
    exists (
      select 1 from public.games g
      where g.id = public.game_events.game_id
        and g.status = 'in_progress'
    )
  );

create policy "coaches_insert_game_events"
  on public.game_events for insert
  with check (
    exists (
      select 1 from public.games g
      where g.id = public.game_events.game_id
        and public.is_coach(g.team_id, auth.uid())
    )
  );

-- No UPDATE or DELETE policies — game_events are immutable

-- ─── pitch_counts ─────────────────────────────────────────────────────────────

create policy "team_members_view_pitch_counts"
  on public.pitch_counts for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.pitch_counts.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- pitch_counts are written by the service-role edge function only
-- No client INSERT/UPDATE policies needed

-- ─── channels ─────────────────────────────────────────────────────────────────

create policy "channel_members_view_channels"
  on public.channels for select
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = public.channels.id
        and user_id = auth.uid()
    )
  );

create policy "coaches_manage_channels"
  on public.channels for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

-- ─── channel_members ──────────────────────────────────────────────────────────

create policy "channel_members_view_membership"
  on public.channel_members for select
  using (
    exists (
      select 1 from public.channel_members cm
      where cm.channel_id = public.channel_members.channel_id
        and cm.user_id = auth.uid()
    )
  );

create policy "users_update_own_channel_membership"
  on public.channel_members for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- channel_members inserts handled by service role (when user is invited to team/channel)

-- ─── messages ─────────────────────────────────────────────────────────────────

create policy "channel_members_read_messages"
  on public.messages for select
  using (
    exists (
      select 1 from public.channel_members
      where channel_id = public.messages.channel_id
        and user_id = auth.uid()
    )
  );

create policy "channel_members_with_post_perm_insert_messages"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.channel_members
      where channel_id = public.messages.channel_id
        and user_id = auth.uid()
        and can_post = true
    )
  );

create policy "users_update_own_messages"
  on public.messages for update
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- ─── game_rsvps ───────────────────────────────────────────────────────────────

create policy "team_members_view_rsvps"
  on public.game_rsvps for select
  using (
    exists (
      select 1 from public.games g
      join public.team_members tm on tm.team_id = g.team_id
      where g.id = public.game_rsvps.game_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "users_manage_own_rsvp"
  on public.game_rsvps for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── push_tokens ──────────────────────────────────────────────────────────────

create policy "users_manage_own_push_tokens"
  on public.push_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─── pitch_compliance_rules ───────────────────────────────────────────────────

-- System presets (null team_id) are readable by all authenticated users
create policy "all_users_view_system_compliance_rules"
  on public.pitch_compliance_rules for select
  using (team_id is null);

-- Team-specific rules readable by team members
create policy "team_members_view_team_compliance_rules"
  on public.pitch_compliance_rules for select
  using (
    team_id is not null
    and exists (
      select 1 from public.team_members
      where team_id = public.pitch_compliance_rules.team_id
        and user_id = auth.uid()
        and is_active = true
    )
  );

create policy "coaches_manage_team_compliance_rules"
  on public.pitch_compliance_rules for all
  using (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  )
  with check (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  );

-- ─── season_compliance_rules ──────────────────────────────────────────────────

create policy "team_members_view_season_compliance"
  on public.season_compliance_rules for select
  using (
    exists (
      select 1 from public.seasons s
      join public.team_members tm on tm.team_id = s.team_id
      where s.id = public.season_compliance_rules.season_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

create policy "coaches_manage_season_compliance"
  on public.season_compliance_rules for all
  using (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_compliance_rules.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.seasons s
      where s.id = public.season_compliance_rules.season_id
        and public.is_coach(s.team_id, auth.uid())
    )
  );
