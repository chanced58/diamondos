-- ============================================================================
-- Practice Engine — Tier 7 hardening (post-review)
--   * opponent_scouting_cards.generated_by: keep history rows when user is deleted
--   * opponent_scouting_cards insert policy: also scope opponent_team_id to team_id
--   * practice_summaries.generated_by: same ON DELETE SET NULL treatment
--   * ai_generations.error_message: cap length at 1000 chars to bound growth
-- ============================================================================

-- generated_by FKs → ON DELETE SET NULL so a user deletion doesn't block history.

alter table public.opponent_scouting_cards
  drop constraint opponent_scouting_cards_generated_by_fkey,
  add constraint opponent_scouting_cards_generated_by_fkey
    foreign key (generated_by) references auth.users(id) on delete set null;

alter table public.practice_summaries
  drop constraint practice_summaries_generated_by_fkey,
  add constraint practice_summaries_generated_by_fkey
    foreign key (generated_by) references auth.users(id) on delete set null;

-- Tighten the scouting-card insert policy: opponent_team_id MUST belong to the
-- same team the caller is inserting for. The previous policy only gated on
-- team_id + is_coach, which let a malicious payload pair opponent_team_id from
-- team A with team_id=B.

drop policy if exists "opponent_scouting_cards_coaches_insert"
  on public.opponent_scouting_cards;

create policy "opponent_scouting_cards_coaches_insert"
  on public.opponent_scouting_cards for insert
  with check (
    public.is_coach(public.opponent_scouting_cards.team_id, auth.uid())
    and exists (
      select 1
        from public.opponent_teams ot
       where ot.id = public.opponent_scouting_cards.opponent_team_id
         and ot.team_id = public.opponent_scouting_cards.team_id
    )
  );

-- Defensive cap on ai_generations.error_message to prevent unbounded growth.
-- The application-side sanitizer truncates to 1000 chars; this CHECK is the
-- DB-level floor.

alter table public.ai_generations
  add constraint ai_generations_error_message_length
    check (error_message is null or char_length(error_message) <= 1000);
