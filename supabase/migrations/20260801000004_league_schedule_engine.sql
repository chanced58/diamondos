-- League-wide scheduling primitives. Team-owned games remain the source of
-- truth for scoring; published slots reference the paired game rows.

create table if not exists public.league_fields (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  name text not null,
  venue_name text,
  timezone text not null default 'UTC',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.league_schedule_templates (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season text not null,
  division_id uuid references public.league_divisions(id) on delete set null,
  format text not null check (format in ('round_robin', 'manual', 'bracket')),
  constraints jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.league_schedule_templates(id) on delete cascade,
  field_id uuid references public.league_fields(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  home_team_id uuid references public.teams(id) on delete set null,
  away_team_id uuid references public.teams(id) on delete set null,
  home_game_id uuid references public.games(id) on delete set null,
  away_game_id uuid references public.games(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'conflict', 'cancelled')),
  conflict_reason text,
  created_at timestamptz not null default now(),
  constraint league_schedule_slots_distinct_teams
    check (home_team_id is null or away_team_id is null or home_team_id <> away_team_id)
);

create index if not exists league_schedule_slots_time_idx
  on public.league_schedule_slots (template_id, starts_at);

alter table public.league_fields enable row level security;
alter table public.league_schedule_templates enable row level security;
alter table public.league_schedule_slots enable row level security;

create policy "league staff view fields"
  on public.league_fields for select
  using (public.is_league_staff(league_id, auth.uid()));
create policy "league staff manage fields"
  on public.league_fields for all
  using (public.is_league_staff(league_id, auth.uid()))
  with check (public.is_league_staff(league_id, auth.uid()));

create policy "league staff view schedule templates"
  on public.league_schedule_templates for select
  using (public.is_league_staff(league_id, auth.uid()));
create policy "league staff manage schedule templates"
  on public.league_schedule_templates for all
  using (public.is_league_staff(league_id, auth.uid()))
  with check (public.is_league_staff(league_id, auth.uid()));

create policy "league staff view schedule slots"
  on public.league_schedule_slots for select
  using (
    exists (
      select 1
      from public.league_schedule_templates t
      where t.id = template_id
        and public.is_league_staff(t.league_id, auth.uid())
    )
  );
create policy "league staff manage schedule slots"
  on public.league_schedule_slots for all
  using (
    exists (
      select 1
      from public.league_schedule_templates t
      where t.id = template_id
        and public.is_league_staff(t.league_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.league_schedule_templates t
      where t.id = template_id
        and public.is_league_staff(t.league_id, auth.uid())
    )
  );
