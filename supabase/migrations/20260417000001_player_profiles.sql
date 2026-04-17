-- Player Pro Profile: individual player accounts with shareable recruiting page.
-- A Player Pro account is keyed to an auth user (not a team or league) and unlocks
-- a public profile at /p/<handle> aggregating career stats across every team the
-- player has played for on the platform.

-- ------------------------------------------------------------------------
-- 1. Extend subscriptions with user_id for per-user (player) subscriptions.
--    The 'player' enum variant is added in the prior migration so it is
--    already committed and usable in the CHECK constraint below.
-- ------------------------------------------------------------------------

alter table public.subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- Replace the entity check to cover the new player variant
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
-- 2. Add email column to players so coaches can link roster entries to users
-- ------------------------------------------------------------------------

alter table public.players
  add column if not exists email text;

create index if not exists idx_players_email on public.players(lower(email));

-- ------------------------------------------------------------------------
-- 3. player_profiles — self-managed recruiting profile
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
    check (handle ~ '^[a-z0-9_-]{3,32}$')
);

create unique index player_profiles_handle_unique
  on public.player_profiles(lower(handle));

create index idx_player_profiles_is_public on public.player_profiles(is_public);

create or replace function public.set_player_profiles_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_player_profiles_updated_at
  before update on public.player_profiles
  for each row execute function public.set_player_profiles_updated_at();

-- ------------------------------------------------------------------------
-- 4. player_highlight_videos — YouTube/Hudl/Vimeo embeds
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

create index idx_player_highlight_videos_user on public.player_highlight_videos(user_id, sort_order);

-- ------------------------------------------------------------------------
-- 5. player_profile_photos — gallery
-- ------------------------------------------------------------------------

create table public.player_profile_photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.player_profiles(user_id) on delete cascade,
  storage_path text not null,
  caption      text,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now()
);

create index idx_player_profile_photos_user on public.player_profile_photos(user_id, sort_order);

-- ------------------------------------------------------------------------
-- 6. Storage bucket + policies for profile photos & gallery
-- ------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('player-media', 'player-media', true)
  on conflict (id) do nothing;

-- Owner can upload to their own <user_id>/ prefix
create policy "player upload own media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "player update own media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "player delete own media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'player-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "anyone view player media"
  on storage.objects for select
  using (bucket_id = 'player-media');

-- ------------------------------------------------------------------------
-- 7. is_player_pro() helper — active Pro subscription check
-- ------------------------------------------------------------------------

create or replace function public.is_player_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions
    where user_id = uid
      and entity_type = 'player'
      and status in ('active', 'trial')
  );
$$;

grant execute on function public.is_player_pro(uuid) to anon, authenticated;

-- ------------------------------------------------------------------------
-- 8. Auto-link triggers — connect players.email to auth users both ways
-- ------------------------------------------------------------------------

-- BEFORE INSERT/UPDATE on players: if email is set and user_id is null,
-- look up a matching auth user (via user_profiles.email) and link it.
create or replace function public.link_player_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_user uuid;
begin
  if new.email is null or new.user_id is not null then
    return new;
  end if;

  select id into matched_user
  from public.user_profiles
  where lower(email) = lower(new.email)
  limit 1;

  if matched_user is not null then
    new.user_id := matched_user;
  end if;

  return new;
end;
$$;

create trigger link_player_to_user_on_insert
  before insert on public.players
  for each row execute function public.link_player_to_user();

create trigger link_player_to_user_on_update
  before update of email on public.players
  for each row
  when (new.email is distinct from old.email or new.user_id is null)
  execute function public.link_player_to_user();

-- Reverse sweep: when a user signs up, retroactively claim any roster rows
-- that already carry their email but no user_id yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;

  -- Sweep any pre-existing roster entries with matching email
  update public.players
    set user_id = new.id
  where user_id is null
    and new.email is not null
    and lower(email) = lower(new.email);

  return new;
end;
$$;

-- ------------------------------------------------------------------------
-- 9. RLS — player_profiles and related tables
-- ------------------------------------------------------------------------

alter table public.player_profiles        enable row level security;
alter table public.player_highlight_videos enable row level security;
alter table public.player_profile_photos   enable row level security;

-- Grants so anonymous visitors can SELECT public profiles
grant select on public.player_profiles         to anon;
grant select on public.player_highlight_videos to anon;
grant select on public.player_profile_photos   to anon;

-- player_profiles SELECT: owner, admin, or (public + Pro)
create policy "player_profiles_select_own"
  on public.player_profiles for select
  using (auth.uid() = user_id);

create policy "player_profiles_select_admin"
  on public.player_profiles for select
  using (public.is_platform_admin());

create policy "player_profiles_select_public"
  on public.player_profiles for select
  to anon, authenticated
  using (is_public = true and public.is_player_pro(user_id));

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

-- player_highlight_videos: gated by parent profile visibility
create policy "player_highlight_videos_select_own"
  on public.player_highlight_videos for select
  using (auth.uid() = user_id);

create policy "player_highlight_videos_select_admin"
  on public.player_highlight_videos for select
  using (public.is_platform_admin());

create policy "player_highlight_videos_select_public"
  on public.player_highlight_videos for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.player_profiles pp
      where pp.user_id = player_highlight_videos.user_id
        and pp.is_public = true
        and public.is_player_pro(pp.user_id)
    )
  );

create policy "player_highlight_videos_write_own"
  on public.player_highlight_videos for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- player_profile_photos: same pattern
create policy "player_profile_photos_select_own"
  on public.player_profile_photos for select
  using (auth.uid() = user_id);

create policy "player_profile_photos_select_admin"
  on public.player_profile_photos for select
  using (public.is_platform_admin());

create policy "player_profile_photos_select_public"
  on public.player_profile_photos for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.player_profiles pp
      where pp.user_id = player_profile_photos.user_id
        and pp.is_public = true
        and public.is_player_pro(pp.user_id)
    )
  );

create policy "player_profile_photos_write_own"
  on public.player_profile_photos for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
