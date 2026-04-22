-- ============================================================================
-- Tier 5 — Integration Hub foundation
-- Migration: team_integrations (per-team integration config + credential refs)
-- ============================================================================

create table public.team_integrations (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  service       text not null,
  config        jsonb not null default '{}'::jsonb,
  is_active     boolean not null default true,
  connected_by  uuid references auth.users(id) on delete set null,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (team_id, service)
);

comment on table public.team_integrations is
  'Per-team integration configuration. The `config` jsonb stores Vault secret NAMES '
  '(e.g. {"ics_secret_ref": "team_<uuid>_ics_secret", "ics_token_version": 1}) and '
  'non-sensitive settings only. Raw API keys, OAuth tokens, and HMAC secrets MUST '
  'NEVER be stored here — always indirect through Supabase Vault.';

comment on column public.team_integrations.service is
  'Stable service identifier, e.g. "calendar_ics", "rapsodo", "blast", "maxpreps".';

create index idx_team_integrations_team_id on public.team_integrations(team_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_team_integrations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_team_integrations_touch_updated_at
  before update on public.team_integrations
  for each row execute function public.touch_team_integrations_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.team_integrations enable row level security;

-- Read: any active member of the team may read config (the config never
-- contains raw secrets, only Vault references and booleans/versions).
create policy "team_integrations_select"
  on public.team_integrations for select
  using (
    exists (
      select 1 from public.team_members tm
      where tm.team_id = public.team_integrations.team_id
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- Write: head_coach / assistant_coach only.
create policy "team_integrations_coach_insert"
  on public.team_integrations for insert
  with check (public.is_coach(team_id, auth.uid()));

create policy "team_integrations_coach_update"
  on public.team_integrations for update
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));

create policy "team_integrations_coach_delete"
  on public.team_integrations for delete
  using (public.is_coach(team_id, auth.uid()));
