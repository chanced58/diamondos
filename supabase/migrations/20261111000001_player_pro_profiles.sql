-- Player Pro, part 2: per-user player subscriptions and the self-managed
-- recruiting profile shown at /p/<handle>.
--
-- Replaces 20260417000001_player_profiles (recorded on prod but never applied)
-- and 20260801000001_player_profile_privacy (never applied), with these changes:
--
--   * No email auto-link. The old file linked any roster row to any account
--     whose email matched players.email (a players trigger and a new
--     handle_new_user). A user is joined to a player only through a pending
--     invitation that records the player (processInvite; see InviteAcceptance
--     in CLAUDE.md), so handle_new_user and players are left unchanged, and
--     career stats come from roster rows claimed that way.
--   * No anon or public read path. Everything that reads another user's
--     profile (/p/<handle>, the auth callback, admin pages, the roster page)
--     uses the service role, and /p/<handle> applies visibility and
--     field_visibility itself. Public RLS policies can't hide columns, so they
--     let anyone with the anon key read GPA and test scores and list unlisted
--     profiles. Owners (/players/me) and platform admins read through RLS.
--   * Media stays in a public bucket (pages render public URLs), with no
--     bucket-wide SELECT policy, so the bucket can't be listed. Uploads are
--     limited to the image types and 5 MB the upload actions accept.

-- ------------------------------------------------------------------------
-- 1. Per-user (player) subscriptions
-- ------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.subscriptions
  drop constraint if exists subscriptions_entity_check;

alter table public.subscriptions
  add constraint subscriptions_entity_check check (
    (entity_type = 'team'   and team_id   is not null and league_id is null and user_id is null) or
    (entity_type = 'league' and league_id is not null and team_id   is null and user_id is null) or
    (entity_type = 'player' and user_id   is not null and team_id   is null and league_id is null)
  );

create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);

create unique index if not exists idx_subscriptions_user_unique_active
  on public.subscriptions(user_id)
  where user_id is not null and status not in ('cancelled', 'expired');

-- ------------------------------------------------------------------------
-- 2. player_profiles
-- ------------------------------------------------------------------------

create type public.highlight_video_provider as enum (
  'youtube',
  'hudl',
  'vimeo',
  'other'
);

create table public.player_profiles (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  handle                     text not null,
  is_public                  boolean not null default false,
  visibility                 text not null default 'private',
  field_visibility           jsonb not null default
    '{"academics": false, "measurables": true, "media": true}'::jsonb,
  headline                   text,
  bio                        text,
  profile_photo_url          text,
  height_inches              smallint,
  weight_lbs                 smallint,
  gpa                        numeric(3,2),
  sat_score                  smallint,
  act_score                  smallint,
  target_majors              text[] not null default '{}',
  sixty_yard_dash_seconds    numeric(4,2),
  exit_velocity_mph          smallint,
  pitch_velocity_mph         smallint,
  pop_time_seconds           numeric(3,2),
  achievements               text[] not null default '{}',
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint player_profiles_handle_format
    check (handle ~ '^[a-z0-9_-]{3,32}$'),
  constraint player_profiles_visibility_check
    check (visibility in ('public', 'unlisted', 'private')),
  constraint player_profiles_gpa_check
    check (gpa is null or (gpa >= 0 and gpa <= 5.00)),
  constraint player_profiles_sat_check
    check (sat_score is null or (sat_score >= 400 and sat_score <= 1600)),
  constraint player_profiles_act_check
    check (act_score is null or (act_score >= 1 and act_score <= 36))
);

create unique index player_profiles_handle_unique
  on public.player_profiles(lower(handle));

create index idx_player_profiles_visibility on public.player_profiles(visibility);

create or replace function public.set_player_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_player_profiles_updated_at
  before update on public.player_profiles
  for each row execute function public.set_player_profiles_updated_at();

-- ------------------------------------------------------------------------
-- 3. player_highlight_videos and player_profile_photos
-- ------------------------------------------------------------------------

create table public.player_highlight_videos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.player_profiles(user_id) on delete cascade,
  title      text not null,
  url        text not null,
  provider   public.highlight_video_provider not null default 'youtube',
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_player_highlight_videos_user
  on public.player_highlight_videos(user_id, sort_order);

create table public.player_profile_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.player_profiles(user_id) on delete cascade,
  storage_path text not null,
  caption      text,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_player_profile_photos_user
  on public.player_profile_photos(user_id, sort_order);

-- ------------------------------------------------------------------------
-- 4. is_player_pro(uid): active or trial player subscription.
--    Called by the service role only (/p/<handle>); not exposed to clients,
--    so it can't be used to probe another user's subscription.
-- ------------------------------------------------------------------------

create or replace function public.is_player_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscriptions
    where user_id = uid
      and entity_type = 'player'
      and status in ('active', 'trial')
  );
$$;

revoke execute on function public.is_player_pro(uuid) from public, anon, authenticated;
grant execute on function public.is_player_pro(uuid) to service_role;

-- ------------------------------------------------------------------------
-- 5. RLS: owner and platform admin only
-- ------------------------------------------------------------------------

alter table public.player_profiles         enable row level security;
alter table public.player_highlight_videos enable row level security;
alter table public.player_profile_photos   enable row level security;

revoke all on public.player_profiles         from anon;
revoke all on public.player_highlight_videos from anon;
revoke all on public.player_profile_photos   from anon;

create policy "player_profiles_select_own"
  on public.player_profiles for select
  to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());

create policy "player_profiles_insert_own"
  on public.player_profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "player_profiles_update_own"
  on public.player_profiles for update
  to authenticated
  using (auth.uid() = user_id or public.is_platform_admin())
  with check (auth.uid() = user_id or public.is_platform_admin());

create policy "player_profiles_delete_own"
  on public.player_profiles for delete
  to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());

create policy "player_highlight_videos_select_own"
  on public.player_highlight_videos for select
  to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());

create policy "player_highlight_videos_write_own"
  on public.player_highlight_videos for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "player_profile_photos_select_own"
  on public.player_profile_photos for select
  to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());

create policy "player_profile_photos_write_own"
  on public.player_profile_photos for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------------------
-- 6. player-media bucket: public URLs, owner-only writes under <user_id>/
-- ------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'player-media',
    'player-media',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  )
  on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

create policy "player_media_owner_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "player_media_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "player_media_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "player_media_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
