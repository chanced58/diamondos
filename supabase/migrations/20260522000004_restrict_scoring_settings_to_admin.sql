-- Restrict UPDATEs of `leagues.scoring_settings` to users with the
-- `league_admin` role. Postgres has no column-level RLS, so we enforce
-- this via a BEFORE-UPDATE trigger that raises when the column changes
-- and the caller is not a league_admin (and not the service-role bypass).
--
-- This complements (does not replace) the existing app-layer check in
-- POST /api/league/scoring-settings; defense in depth.

create or replace function public.leagues_guard_scoring_settings_update()
returns trigger
language plpgsql
security definer
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
begin
  -- No-op when the column didn't change.
  if new.scoring_settings is not distinct from old.scoring_settings then
    return new;
  end if;

  -- Service-role calls (no auth.uid()) bypass — service-role is already
  -- privileged. App-layer checks gate human callers.
  if v_caller is null then
    return new;
  end if;

  v_is_admin := public.get_league_role(new.id, v_caller) = 'league_admin';
  if not v_is_admin then
    raise exception 'Only league_admin may update scoring_settings'
      using errcode = '42501'; -- insufficient_privilege
  end if;

  return new;
end;
$$;

comment on function public.leagues_guard_scoring_settings_update is
  'Trigger function: enforces league_admin-only writes to leagues.scoring_settings. '
  'Service-role connections (auth.uid() = NULL) bypass.';

drop trigger if exists leagues_scoring_settings_guard on public.leagues;

create trigger leagues_scoring_settings_guard
  before update on public.leagues
  for each row
  execute function public.leagues_guard_scoring_settings_update();
