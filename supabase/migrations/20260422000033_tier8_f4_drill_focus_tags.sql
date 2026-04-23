-- ============================================================================
-- Practice Engine — Tier 8
-- F4: Practice volume analytics via drill_focus taxonomy
--
--   * drill_focus_catalog — controlled vocabulary nested under skill_category
--   * practice_drill_focus_tags — join table, drill × focus
--   * v_practice_volume_by_focus — rollup view used by the analytics page
-- ============================================================================

create type public.drill_focus_visibility as enum ('system', 'team');

create table public.drill_focus_catalog (
  slug           text primary key,
  name           text not null,
  description    text,
  parent_slug    text references public.drill_focus_catalog(slug) on delete set null,
  visibility     public.drill_focus_visibility not null default 'team',
  team_id        uuid references public.teams(id) on delete cascade,
  sort_order     smallint not null default 100,
  created_at     timestamptz not null default now(),
  check ((visibility = 'system' and team_id is null) or (visibility = 'team' and team_id is not null))
);

comment on table public.drill_focus_catalog is
  'Finer-grained taxonomy than skill_category: e.g. "bunt_defense", "pickoffs". System seeds are the common focuses; teams can add their own.';

insert into public.drill_focus_catalog (slug, name, description, visibility, sort_order)
values
  ('bunt_defense',             'Bunt defense',              'Defensive coverage and reads on bunts — corners crashing, pitcher off the mound, catcher directing.', 'system', 10),
  ('bunt_offense',             'Bunt offense',              'Sacrifice, push, drag, squeeze, and safety-squeeze execution at the plate.',                             'system', 20),
  ('pickoffs',                 'Pickoffs',                   'Pitcher and catcher holds, pickoff moves, and backdoor pickoffs to all bases.',                          'system', 30),
  ('first_and_third',          'First & third situations',   '1st-and-3rd offense and defense: steals, cut-offs, decoys, look-backs.',                                 'system', 40),
  ('pfp',                      'Pitcher fielding practice (PFP)', 'Pitcher responsibilities: covering first, fielding comebackers, backing up bases.',                 'system', 50),
  ('cutoffs_relays',           'Cutoffs and relays',         'Outfield-to-infield throw sequences and relay positioning.',                                             'system', 60),
  ('rundowns',                 'Rundowns',                   'Pickle defense: chase, throw, tag, back-up.',                                                             'system', 70),
  ('pop_times',                'Pop times (catchers)',       'Catcher pop-time work to second/third base.',                                                             'system', 80),
  ('mound_visits',             'Mound visits',               'Game-management conversations, signals, and composure resets.',                                           'system', 90),
  ('situational_hitting',      'Situational hitting',        'Hitting the right way in game situations: runner on 2nd <2 outs, infield in, etc.',                       'system', 100),
  ('two_strike_hitting',       'Two-strike hitting',         'Approach changes with two strikes: shorter swing, expand zone, foul off pitches.',                        'system', 110),
  ('baserunning_reads',        'Baserunning reads',          'Reads off the bat: tag-up on fly balls, primary/secondary leads, break on contact.',                      'system', 120),
  ('outfield_communication',   'Outfield communication',     'Calling for balls, priority, fence work, and wall positioning.',                                          'system', 130),
  ('backup_responsibilities',  'Backup responsibilities',    'Where each position backs up on batted/thrown balls.',                                                    'system', 140);

-- ─── Drill ↔ focus tags ─────────────────────────────────────────────────────

create table public.practice_drill_focus_tags (
  id           uuid primary key default gen_random_uuid(),
  drill_id     uuid not null references public.practice_drills(id) on delete cascade,
  focus_slug   text not null references public.drill_focus_catalog(slug) on delete cascade,
  team_id      uuid references public.teams(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.practice_drill_focus_tags is
  'Tags a drill with a focus slug. System-level tags (team_id null) cover the seeded drill library; team rows let coaches add their own mappings.';

create unique index practice_drill_focus_tags_unique
  on public.practice_drill_focus_tags(drill_id, focus_slug, coalesce(team_id, '00000000-0000-0000-0000-000000000000'));

create index practice_drill_focus_tags_focus_idx
  on public.practice_drill_focus_tags(focus_slug);

-- ─── Rollup view for the analytics page ─────────────────────────────────────
-- Aggregates minutes by (team, focus) plus the most-recent scheduled_at. The
-- UI filters by date range to scope to a season. A drill tagged with two
-- focuses contributes to both rows.

create or replace view public.v_practice_volume_by_focus
  with (security_invoker = true) as
select
  p.team_id,
  t.focus_slug,
  sum(b.planned_duration_minutes)::int as total_planned_minutes,
  sum(coalesce(b.actual_duration_minutes, 0))::int as total_actual_minutes,
  count(distinct p.id)::int as session_count,
  max(p.scheduled_at) as last_worked_at,
  min(p.scheduled_at) as first_worked_at
from public.practice_blocks b
join public.practices p on p.id = b.practice_id
join public.practice_drill_focus_tags t on t.drill_id = b.drill_id
where p.team_id is not null
group by p.team_id, t.focus_slug;

comment on view public.v_practice_volume_by_focus is
  'Tier 8 F4: total minutes per (team, focus) across all practices, with first/last worked timestamps. Filter client-side by scheduled_at for per-season views.';

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.drill_focus_catalog enable row level security;
alter table public.practice_drill_focus_tags enable row level security;

create policy "dfc_select_all"
  on public.drill_focus_catalog for select
  using (
    visibility = 'system'
    or (visibility = 'team' and public.is_coach(team_id, auth.uid()))
    or (
      visibility = 'team'
      and exists (
        select 1 from public.team_members tm
         where tm.team_id = public.drill_focus_catalog.team_id
           and tm.user_id = auth.uid()
           and tm.is_active
      )
    )
  );

create policy "dfc_coach_write"
  on public.drill_focus_catalog for all
  using (visibility = 'team' and public.is_coach(team_id, auth.uid()))
  with check (visibility = 'team' and public.is_coach(team_id, auth.uid()));

create policy "pdft_select_all"
  on public.practice_drill_focus_tags for select
  using (
    team_id is null
    or exists (
      select 1 from public.team_members tm
       where tm.team_id = public.practice_drill_focus_tags.team_id
         and tm.user_id = auth.uid()
         and tm.is_active
    )
  );

create policy "pdft_coach_write"
  on public.practice_drill_focus_tags for all
  using (team_id is not null and public.is_coach(team_id, auth.uid()))
  with check (team_id is not null and public.is_coach(team_id, auth.uid()));
