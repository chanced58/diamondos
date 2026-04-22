-- ============================================================================
-- Practice Engine — Tier 7 F3
-- Migration: AI-generated opponent scouting card (versioned history)
-- ============================================================================

create table public.opponent_scouting_cards (
  id                   uuid primary key default gen_random_uuid(),
  opponent_team_id     uuid not null references public.opponent_teams(id) on delete cascade,
  team_id              uuid not null references public.teams(id) on delete cascade,
  ai_card              jsonb not null,
  hitter_stats         jsonb not null default '[]'::jsonb,
  pitcher_stats        jsonb not null default '[]'::jsonb,
  game_sample_count    integer not null default 0,
  model                text not null,
  generated_by         uuid references auth.users(id),
  generated_at         timestamptz not null default now()
);

comment on table public.opponent_scouting_cards is
  'Versioned AI-generated opponent scouting cards (Tier 7 F3). Each generation writes a new row so coaches can compare a pre-game card against post-game reality.';

create index idx_opponent_scouting_cards_opp_generated
  on public.opponent_scouting_cards(opponent_team_id, generated_at desc);

create index idx_opponent_scouting_cards_team
  on public.opponent_scouting_cards(team_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.opponent_scouting_cards enable row level security;

create policy "opponent_scouting_cards_team_members_select"
  on public.opponent_scouting_cards for select
  using (
    exists (
      select 1
        from public.team_members tm
       where tm.team_id = public.opponent_scouting_cards.team_id
         and tm.user_id = auth.uid()
         and tm.is_active = true
    )
  );

create policy "opponent_scouting_cards_coaches_insert"
  on public.opponent_scouting_cards for insert
  with check (
    public.is_coach(public.opponent_scouting_cards.team_id, auth.uid())
  );

create policy "opponent_scouting_cards_coaches_update"
  on public.opponent_scouting_cards for update
  using (public.is_coach(public.opponent_scouting_cards.team_id, auth.uid()))
  with check (public.is_coach(public.opponent_scouting_cards.team_id, auth.uid()));

create policy "opponent_scouting_cards_coaches_delete"
  on public.opponent_scouting_cards for delete
  using (public.is_coach(public.opponent_scouting_cards.team_id, auth.uid()));
