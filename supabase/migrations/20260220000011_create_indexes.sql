-- Performance indexes

-- User lookups
create index user_profiles_name_idx
  on public.user_profiles using gin(to_tsvector('english', first_name || ' ' || last_name));

-- Team membership
create index team_members_user_id_idx on public.team_members(user_id);
create index team_members_team_id_idx on public.team_members(team_id) where is_active = true;

-- Player lookups
create index players_team_id_idx on public.players(team_id) where is_active = true;
create index players_user_id_idx on public.players(user_id) where user_id is not null;
create index players_name_idx
  on public.players using gin(to_tsvector('english', first_name || ' ' || last_name));

-- Parent-player links
create index parent_player_links_parent_idx on public.parent_player_links(parent_user_id);
create index parent_player_links_player_idx on public.parent_player_links(player_id);

-- Season rosters
create index season_rosters_season_idx on public.season_rosters(season_id);
create index season_rosters_player_idx on public.season_rosters(player_id);

-- Games
create index games_season_id_idx on public.games(season_id);
create index games_team_id_idx on public.games(team_id);
create index games_scheduled_at_idx on public.games(scheduled_at);
create index games_status_idx on public.games(status) where status in ('scheduled', 'in_progress');

-- Game events (already has primary index from migration 6)
-- Additional index for "events since sync" queries
create index game_events_synced_at_idx on public.game_events(game_id, synced_at);

-- Pitch counts
create index pitch_counts_player_season_idx on public.pitch_counts(player_id, season_id);
create index pitch_counts_game_date_idx on public.pitch_counts(game_date);

-- Messaging
create index messages_channel_id_idx
  on public.messages(channel_id, created_at desc)
  where deleted_at is null;
create index messages_parent_id_idx
  on public.messages(parent_id)
  where parent_id is not null;
create index channel_members_user_id_idx on public.channel_members(user_id);
create index channel_members_channel_id_idx on public.channel_members(channel_id);

-- Push tokens
create index push_tokens_user_id_idx on public.push_tokens(user_id);

-- Compliance
create index compliance_rules_team_id_idx
  on public.pitch_compliance_rules(team_id)
  where team_id is not null;
