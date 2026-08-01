-- Granular profile visibility and field-level consent controls.

alter table public.player_profiles
  add column if not exists visibility text not null default 'private',
  add column if not exists field_visibility jsonb not null default
    '{"academics": false, "measurables": true, "media": true}'::jsonb;

update public.player_profiles
set visibility = case when is_public then 'public' else 'private' end
where visibility = 'private' and is_public;

alter table public.player_profiles
  drop constraint if exists player_profiles_visibility_check;

alter table public.player_profiles
  add constraint player_profiles_visibility_check
  check (visibility in ('public', 'unlisted', 'private'));

drop policy if exists "player_profiles_select_public" on public.player_profiles;
create policy "player_profiles_select_public"
  on public.player_profiles for select
  to anon, authenticated
  using (
    visibility in ('public', 'unlisted')
    and public.is_player_pro(user_id)
  );

drop policy if exists "player_highlight_videos_select_public" on public.player_highlight_videos;
create policy "player_highlight_videos_select_public"
  on public.player_highlight_videos for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.player_profiles pp
      where pp.user_id = player_highlight_videos.user_id
        and pp.visibility in ('public', 'unlisted')
        and (pp.field_visibility->>'media')::boolean is true
        and public.is_player_pro(pp.user_id)
    )
  );

drop policy if exists "player_profile_photos_select_public" on public.player_profile_photos;
create policy "player_profile_photos_select_public"
  on public.player_profile_photos for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.player_profiles pp
      where pp.user_id = player_profile_photos.user_id
        and pp.visibility in ('public', 'unlisted')
        and (pp.field_visibility->>'media')::boolean is true
        and public.is_player_pro(pp.user_id)
    )
  );
