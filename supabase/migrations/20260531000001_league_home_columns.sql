-- League home page: public URL slug, visibility, theme, and leader config.
-- slug/visibility/home_theme/leader_config drive the public /l/[slug] page.
-- Shape of home_theme and leader_config is validated in @baseball/shared
-- (leagueHomeThemeSchema, leagueLeaderConfigSchema); DB only asserts JSON object.

alter table public.leagues
  add column slug          text,
  add column visibility    text not null default 'public',
  add column home_theme    jsonb not null default '{}'::jsonb,
  add column leader_config  jsonb not null default '{}'::jsonb;

alter table public.leagues
  add constraint leagues_visibility_check
  check (visibility in ('public', 'signed_in'));

alter table public.leagues
  add constraint leagues_home_theme_is_object
  check (jsonb_typeof(home_theme) = 'object');

alter table public.leagues
  add constraint leagues_leader_config_is_object
  check (jsonb_typeof(leader_config) = 'object');

-- Backfill a unique slug from name for existing leagues:
-- lowercased, non-alphanumerics to hyphens, trimmed, with a short id suffix
-- to guarantee uniqueness even across duplicate names.
update public.leagues
set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
           || '-' || left(replace(id::text, '-', ''), 6)
where slug is null;

alter table public.leagues alter column slug set not null;
create unique index leagues_slug_key on public.leagues(slug);

comment on column public.leagues.slug is 'Public URL identifier for /l/[slug]. Lowercase kebab-case, globally unique.';
comment on column public.leagues.visibility is 'public = anyone; signed_in = any authenticated user only.';
