-- ============================================================================
-- Practice Engine — Tier 6 Game-Prep Linkage
-- Migration: structured scouting tags on opponents (auto-derived + coach-authored)
-- ============================================================================

create type public.opponent_scouting_category as enum (
  'pitch_mix',
  'pitcher_handedness',
  'batter_profile',
  'approach',
  'baserunning',
  'defense'
);

create type public.opponent_scouting_source as enum ('manual', 'auto_derived');

create table public.opponent_scouting_tags (
  id                uuid primary key default gen_random_uuid(),
  opponent_team_id  uuid not null references public.opponent_teams(id) on delete cascade,
  category          public.opponent_scouting_category not null,
  tag_value         text not null,
  note              text,
  source            public.opponent_scouting_source not null,
  confidence        numeric(3, 2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence          jsonb not null default '{}'::jsonb,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint opponent_scouting_tags_manual_no_confidence check (
    source = 'auto_derived' or confidence is null
  ),
  constraint opponent_scouting_tags_unique_per_opponent
    unique (opponent_team_id, category, tag_value, source)
);

comment on table public.opponent_scouting_tags is
  'Structured scouting tags on an opponent team. Auto-derived rows (source=auto_derived) come from aggregating past game_events against this opponent and carry a confidence + evidence payload. Manual rows (source=manual) are coach-authored and ignore confidence.';

create index idx_opponent_scouting_tags_opp
  on public.opponent_scouting_tags(opponent_team_id);
create index idx_opponent_scouting_tags_category
  on public.opponent_scouting_tags(opponent_team_id, category);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function public.touch_opponent_scouting_tags_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_opponent_scouting_tags_touch_updated_at
  before update on public.opponent_scouting_tags
  for each row execute function public.touch_opponent_scouting_tags_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.opponent_scouting_tags enable row level security;

-- Read: any active member of the team that owns the opponent record.
create policy "opponent_scouting_tags_select"
  on public.opponent_scouting_tags for select
  using (
    exists (
      select 1
        from public.opponent_teams ot
        join public.team_members tm on tm.team_id = ot.team_id
       where ot.id = public.opponent_scouting_tags.opponent_team_id
         and tm.user_id = auth.uid()
         and tm.is_active = true
    )
  );

-- Write: only coaches on the owning team. Applies to manual AND auto-derived
-- rows — auto-derived rows are written by coach-triggered derivation flows,
-- not by unauthenticated or player-tier users.
create policy "opponent_scouting_tags_coach_insert"
  on public.opponent_scouting_tags for insert
  with check (
    exists (
      select 1 from public.opponent_teams ot
       where ot.id = public.opponent_scouting_tags.opponent_team_id
         and public.is_coach(ot.team_id, auth.uid())
    )
  );

create policy "opponent_scouting_tags_coach_update"
  on public.opponent_scouting_tags for update
  using (
    exists (
      select 1 from public.opponent_teams ot
       where ot.id = public.opponent_scouting_tags.opponent_team_id
         and public.is_coach(ot.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.opponent_teams ot
       where ot.id = public.opponent_scouting_tags.opponent_team_id
         and public.is_coach(ot.team_id, auth.uid())
    )
  );

create policy "opponent_scouting_tags_coach_delete"
  on public.opponent_scouting_tags for delete
  using (
    exists (
      select 1 from public.opponent_teams ot
       where ot.id = public.opponent_scouting_tags.opponent_team_id
         and public.is_coach(ot.team_id, auth.uid())
    )
  );
