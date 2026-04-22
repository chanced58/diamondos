-- ============================================================================
-- Practice Engine — Tier 4 development layer
-- Migration: tighten drill_deficit_tags RLS to respect deficit visibility
-- ============================================================================
--
-- Original RLS on practice_drill_deficit_tags (migration 20260422000002) only
-- gated on drill visibility + tag team-scope. A coach on team A could INSERT a
-- tag referencing team B's deficit_id (if the UUID was known), which would
-- then leak the deficit via a join. Tighten SELECT and INSERT to also verify
-- the referenced deficit is visible to the caller (system OR caller is an
-- active member of the deficit's team).

drop policy if exists "drill_deficit_tags_select"        on public.practice_drill_deficit_tags;
drop policy if exists "drill_deficit_tags_coach_insert"  on public.practice_drill_deficit_tags;

create policy "drill_deficit_tags_select"
  on public.practice_drill_deficit_tags for select
  using (
    exists (
      select 1
      from public.practice_drills d
      where d.id = public.practice_drill_deficit_tags.drill_id
        and (
          d.visibility = 'system'
          or (
            d.team_id is not null
            and exists (
              select 1 from public.team_members tm
              where tm.team_id = d.team_id
                and tm.user_id = auth.uid()
                and tm.is_active = true
            )
          )
        )
    )
    and (
      team_id is null
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = public.practice_drill_deficit_tags.team_id
          and tm.user_id = auth.uid()
          and tm.is_active = true
      )
    )
    and exists (
      select 1
      from public.practice_deficits pd
      where pd.id = public.practice_drill_deficit_tags.deficit_id
        and (
          pd.visibility = 'system'
          or (
            pd.team_id is not null
            and exists (
              select 1 from public.team_members tm
              where tm.team_id = pd.team_id
                and tm.user_id = auth.uid()
                and tm.is_active = true
            )
          )
        )
    )
  );

create policy "drill_deficit_tags_coach_insert"
  on public.practice_drill_deficit_tags for insert
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
