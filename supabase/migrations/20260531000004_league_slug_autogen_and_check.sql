-- Auto-generate a valid slug on insert when one isn't supplied, so existing
-- league-creation paths (create-league edge fn, admin actions) keep working
-- after slug became NOT NULL. Also enforce the documented slug format.

create or replace function public.set_league_slug()
returns trigger
language plpgsql
as $$
declare
  base text;
begin
  if new.slug is null or new.slug = '' then
    base := nullif(trim(both '-' from regexp_replace(lower(coalesce(new.name, '')), '[^a-z0-9]+', '-', 'g')), '');
    new.slug := coalesce(base, 'league') || '-' || left(replace(new.id::text, '-', ''), 6);
  end if;
  return new;
end;
$$;

create trigger trg_set_league_slug
  before insert on public.leagues
  for each row execute function public.set_league_slug();

-- Documented format: lowercase kebab-case. Existing rows already conform.
alter table public.leagues
  add constraint leagues_slug_format
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
