-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: tighten drill_deficit_tags UPDATE policy on deficit/drill visibility
-- ============================================================================
--
-- Migration 20260422000003 tightened SELECT and INSERT but left UPDATE on the
-- earlier "team_id not null and is_coach(...)" shape. A coach who mutated
-- deficit_id/drill_id via UPDATE could point a tag at rows they can't read.
-- Mirror the INSERT with_check so UPDATE enforces the same drill + deficit
-- visibility guarantees.

drop policy if exists "drill_deficit_tags_coach_update" on public.practice_drill_deficit_tags;

create policy "drill_deficit_tags_coach_update"
  on public.practice_drill_deficit_tags for update
  using (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
  )
  with check (
    team_id is not null
    and public.is_coach(team_id, auth.uid())
    and exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_deficit_tags.drill_id
        and (
          d.visibility = 'system'
          or d.team_id = public.practice_drill_deficit_tags.team_id
        )
    )
    and exists (
      select 1
      from public.practice_deficits pd
      where pd.id = public.practice_drill_deficit_tags.deficit_id
        and (
          pd.visibility = 'system'
          or pd.team_id = public.practice_drill_deficit_tags.team_id
        )
    )
  );
