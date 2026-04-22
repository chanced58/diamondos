-- ============================================================================
-- Practice Engine — Tier 6 Game-Prep Linkage
-- Migration: link practices to a target game + free-text prep focus summary
-- ============================================================================

alter table public.practices
  add column linked_game_id     uuid references public.games(id) on delete set null,
  add column prep_focus_summary text;

comment on column public.practices.linked_game_id is
  'Optional link to the upcoming game this practice is preparing for. Nulls out if the game is deleted.';
comment on column public.practices.prep_focus_summary is
  'Human-readable rationale for this prep practice — what it targets (opponent tendencies, weaknesses). Rendered in the practice plan header when linked_game_id is set.';

create index idx_practices_linked_game_id
  on public.practices(linked_game_id)
  where linked_game_id is not null;
