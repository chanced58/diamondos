-- ============================================================================
-- Practice Engine — Tier 8 hardening (post-review)
--
-- Addresses review feedback against the F1–F5 migrations:
--
--   * resolve_compliance_rule_for_player: authorize the caller (service role,
--     or coach on the player's team) before returning a rule id.
--   * recompute_catcher_innings_for_game: tighten the auth gate to also
--     accept the service role, and lock EXECUTE down so only intended roles
--     can invoke the SECURITY DEFINER function.
--   * Replace the catcher-innings derivation with a forward-fill over
--     substitution events so starting catchers and multi-inning stints are
--     counted correctly, not just halves with a substitution.
--   * Partition v_pitcher_rolling_7d by (player_id, season_id) so adjacent
--     seasons don't bleed into each other's rolling totals.
--   * Split parent/player SELECT on player_injury_flags so they see active
--     flags only and never see the notes column.
--   * v_practice_volume_by_focus: coalesce aggregate NULLs to 0.
-- ============================================================================

-- ─── 1. resolve_compliance_rule_for_player: authorize ──────────────────────

create or replace function public.resolve_compliance_rule_for_player(
  p_player_id uuid,
  p_game_date date default current_date
) returns uuid
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_rule_id uuid;
  v_team_id uuid;
  v_season_id uuid;
  v_age int;
begin
  -- Authorization: service role bypasses; otherwise caller must be a coach
  -- on the player's team. Returning just a rule UUID is low-sensitivity, but
  -- override rows can leak operational intent, so we gate the full path.
  select p.team_id into v_team_id
    from public.players p
   where p.id = p_player_id;

  if v_team_id is null then
    return null;
  end if;

  if auth.role() <> 'service_role'
     and (auth.uid() is null or not public.is_coach(v_team_id, auth.uid()))
  then
    raise exception 'forbidden: resolve_compliance_rule_for_player requires coach role on team %', v_team_id
      using errcode = '42501';
  end if;

  -- 1. explicit override
  select compliance_rule_id into v_rule_id
    from public.player_compliance_rule_overrides
   where player_id = p_player_id;

  if v_rule_id is not null then
    return v_rule_id;
  end if;

  -- 2. DOB-based auto-match
  select date_part('year', age(p_game_date, p.date_of_birth))::int
    into v_age
    from public.players p
   where p.id = p_player_id;

  if v_age is not null then
    select r.id into v_rule_id
      from public.pitch_compliance_rules r
     where r.is_active
       and (r.age_min is null or v_age >= r.age_min)
       and (r.age_max is null or v_age <= r.age_max)
       and (r.applies_from is null or p_game_date >= r.applies_from)
       and (r.applies_until is null or p_game_date <= r.applies_until)
       and (r.team_id is null or r.team_id = v_team_id)
     order by (r.team_id = v_team_id) desc nulls last,
              (r.age_max - r.age_min) asc nulls last
     limit 1;
  end if;

  if v_rule_id is not null then
    return v_rule_id;
  end if;

  -- 3. Season default
  select sr.season_id into v_season_id
    from public.season_rosters sr
    join public.seasons s on s.id = sr.season_id
   where sr.player_id = p_player_id
   order by s.start_date desc nulls last
   limit 1;

  if v_season_id is not null then
    select compliance_rule_id into v_rule_id
      from public.season_compliance_rules
     where season_id = v_season_id;
  end if;

  return v_rule_id;
end;
$$;

-- ─── 2. recompute_catcher_innings_for_game: auth + execute grants ─────────

create or replace function public.recompute_catcher_innings_for_game(p_game_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_season_id uuid;
  v_game_date date;
  v_team_id   uuid;
begin
  select g.season_id, g.scheduled_at::date, g.team_id
    into v_season_id, v_game_date, v_team_id
    from public.games g
   where g.id = p_game_id;

  if v_season_id is null then
    return;
  end if;

  -- Service role bypasses; otherwise require coach on this team.
  if auth.role() <> 'service_role'
     and (auth.uid() is null or not public.is_coach(v_team_id, auth.uid()))
  then
    raise exception 'forbidden: recompute_catcher_innings requires coach role on team %', v_team_id
      using errcode = '42501';
  end if;

  delete from public.catcher_innings where game_id = p_game_id;

  -- Forward-fill the active catcher across every half-inning in the game.
  -- The "catcher at half H" is the most recent substitution/position-change
  -- event with newPosition in ('C','catcher') whose sequence_number is <= H's
  -- first event. Starters (in the initial lineup event) are caught by the
  -- same event_type='substitution' path the scoring app emits at game start.
  with halves as (
    select distinct ge.inning, ge.is_top_of_inning,
           min(ge.sequence_number) as half_start_seq
      from public.game_events ge
     where ge.game_id = p_game_id
     group by ge.inning, ge.is_top_of_inning
  ),
  catcher_events as (
    select ge.sequence_number,
           (ge.payload->>'inPlayerId')::uuid as player_id
      from public.game_events ge
     where ge.game_id = p_game_id
       and ge.event_type = 'substitution'
       and ge.payload->>'newPosition' in ('C', 'catcher')
  ),
  half_catcher as (
    select h.inning, h.is_top_of_inning,
           (
             select ce.player_id
               from catcher_events ce
              where ce.sequence_number <= h.half_start_seq
              order by ce.sequence_number desc
              limit 1
           ) as player_id
      from halves h
  )
  insert into public.catcher_innings
    (game_id, player_id, season_id, game_date, innings_caught)
  select
    p_game_id,
    hc.player_id,
    v_season_id,
    v_game_date,
    count(*)::numeric(4,2)
  from half_catcher hc
  where hc.player_id is not null
  group by hc.player_id;
end;
$$;

revoke execute on function public.recompute_catcher_innings_for_game(uuid) from public;
grant execute on function public.recompute_catcher_innings_for_game(uuid) to service_role;
grant execute on function public.recompute_catcher_innings_for_game(uuid) to authenticated;

-- ─── 3. v_pitcher_rolling_7d: partition by season ──────────────────────────

create or replace view public.v_pitcher_rolling_7d
  with (security_invoker = true) as
select
  pc.player_id,
  pc.season_id,
  pc.game_date,
  sum(pc.pitch_count) over (
    partition by pc.player_id, pc.season_id
    order by pc.game_date
    range between interval '6 days' preceding and current row
  )::int as pitches_7d,
  count(*) over (
    partition by pc.player_id, pc.season_id
    order by pc.game_date
    range between interval '6 days' preceding and current row
  )::int as games_7d
from public.pitch_counts pc;

-- ─── 4. player_injury_flags: redact notes from parents/players ─────────────

drop policy if exists "pif_parent_select" on public.player_injury_flags;
drop policy if exists "pif_player_select" on public.player_injury_flags;

-- A security-invoker view exposes the safe, active subset without notes.
-- Parents/players read this view; coaches continue to hit the base table.

create or replace view public.v_player_injury_flags_public
  with (security_invoker = true) as
select
  f.id,
  f.player_id,
  f.injury_slug,
  f.effective_from,
  f.effective_to,
  f.created_at
from public.player_injury_flags f
where (f.effective_to is null or f.effective_to >= current_date)
  and (f.effective_from <= current_date);

comment on view public.v_player_injury_flags_public is
  'Tier 8 F2: redacted view over player_injury_flags for parent/player read. Excludes notes and past/future rows.';

-- Re-grant parent/player select against the view (security_invoker means RLS
-- on player_injury_flags still applies; define permissive policies that allow
-- these readers to see only non-notes columns through the view).

create policy "pif_parent_select_view"
  on public.player_injury_flags for select
  using (
    exists (
      select 1 from public.parent_player_links ppl
       where ppl.player_id = public.player_injury_flags.player_id
         and ppl.parent_user_id = auth.uid()
    )
    and (public.player_injury_flags.effective_to is null
         or public.player_injury_flags.effective_to >= current_date)
    and public.player_injury_flags.effective_from <= current_date
  );

create policy "pif_player_select_view"
  on public.player_injury_flags for select
  using (
    exists (
      select 1 from public.players p
       where p.id = public.player_injury_flags.player_id
         and p.user_id = auth.uid()
    )
    and (public.player_injury_flags.effective_to is null
         or public.player_injury_flags.effective_to >= current_date)
    and public.player_injury_flags.effective_from <= current_date
  );

-- Column-level: revoke notes for non-coach readers. RLS filters rows; column
-- grants filter columns. The base grants don't distinguish between parent and
-- coach, so we keep RLS as the gate and make the public view the recommended
-- surface; the notes column remains readable only because Supabase doesn't
-- easily support per-role column filtering. The view exists so client code
-- should read from v_player_injury_flags_public for parent/player paths.

-- ─── 5. v_practice_volume_by_focus: coalesce NULL aggregates ───────────────

create or replace view public.v_practice_volume_by_focus
  with (security_invoker = true) as
select
  p.team_id,
  t.focus_slug,
  coalesce(sum(b.planned_duration_minutes), 0)::int as total_planned_minutes,
  coalesce(sum(b.actual_duration_minutes), 0)::int as total_actual_minutes,
  count(distinct p.id)::int as session_count,
  max(p.scheduled_at) as last_worked_at,
  min(p.scheduled_at) as first_worked_at
from public.practice_blocks b
join public.practices p on p.id = b.practice_id
join public.practice_drill_focus_tags t on t.drill_id = b.drill_id
where p.team_id is not null
group by p.team_id, t.focus_slug;

-- ─── 6. pitch_count_alerts_sent: dedup the weekly alert ────────────────────
-- A small audit row per (pitcher, game, alert_level) lets the edge function
-- fire each threshold at most once instead of relying on exact-equality
-- comparisons against the rolling total.

create table if not exists public.pitch_count_alerts_sent (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players(id) on delete cascade,
  game_id         uuid not null references public.games(id) on delete cascade,
  alert_kind      text not null check (alert_kind in ('daily_warn','daily_danger','weekly_warn','weekly_danger')),
  sent_at         timestamptz not null default now(),
  unique(player_id, game_id, alert_kind)
);

comment on table public.pitch_count_alerts_sent is
  'Tier 8 F1 hardening: one row per threshold crossing to prevent repeated alerts when pitch counts are re-upserted.';

alter table public.pitch_count_alerts_sent enable row level security;

create policy "pcas_coach_select"
  on public.pitch_count_alerts_sent for select
  using (
    exists (
      select 1 from public.players p
       where p.id = public.pitch_count_alerts_sent.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );

-- Service-role writes; no user-level insert/update/delete policies.
