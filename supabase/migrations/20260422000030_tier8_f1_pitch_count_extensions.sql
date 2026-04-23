-- ============================================================================
-- Practice Engine — Tier 8
-- F1: Pitch count & innings extensions
--
--   * pitch_compliance_rules.max_pitches_per_week (optional rolling 7-day cap)
--   * player_compliance_rule_overrides (per-player rule, overrides DOB auto-match)
--   * public.resolve_compliance_rule_for_player() — precedence:
--       override → DOB-matching rule → season default
--   * v_pitcher_rolling_7d — rolling 7-day pitch totals per player/season
--   * catcher_innings — per-game catcher workload (populated by recompute helper)
--   * public.recompute_catcher_innings_for_game() — best-effort derivation
--     from substitution events in game_events
-- ============================================================================

-- ─── 1. Weekly cap column on compliance rules ───────────────────────────────

alter table public.pitch_compliance_rules
  add column if not exists max_pitches_per_week smallint
    check (max_pitches_per_week is null or max_pitches_per_week > 0);

comment on column public.pitch_compliance_rules.max_pitches_per_week is
  'Optional rolling 7-day pitch cap. NULL = no weekly limit (daily + rest-day rules only).';

-- ─── 2. Per-player rule overrides ───────────────────────────────────────────

create table public.player_compliance_rule_overrides (
  player_id           uuid primary key references public.players(id) on delete cascade,
  compliance_rule_id  uuid not null references public.pitch_compliance_rules(id) on delete restrict,
  reason              text,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table public.player_compliance_rule_overrides is
  'Per-player override of compliance rule. Takes precedence over DOB-based auto-match and season default.';

-- ─── 3. Rule resolution helper ──────────────────────────────────────────────
-- Precedence: explicit override → DOB-matching active rule → season default.
-- SECURITY DEFINER because it reads across team boundaries (system presets).

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
  -- 1. explicit override
  select compliance_rule_id into v_rule_id
    from public.player_compliance_rule_overrides
   where player_id = p_player_id;

  if v_rule_id is not null then
    return v_rule_id;
  end if;

  -- 2. DOB-based auto-match (age at game_date, inside applies_from/until window)
  select p.team_id,
         date_part('year', age(p_game_date, p.date_of_birth))::int
    into v_team_id, v_age
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
       -- Team-specific rules beat system presets
       and (r.team_id is null or r.team_id = v_team_id)
     order by (r.team_id = v_team_id) desc nulls last,
              (r.age_max - r.age_min) asc nulls last
     limit 1;
  end if;

  if v_rule_id is not null then
    return v_rule_id;
  end if;

  -- 3. Season default: find the player's most recent season via season_rosters
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

comment on function public.resolve_compliance_rule_for_player is
  'Returns the compliance rule that applies to a player: override → DOB auto-match → season default. NULL if no rule matches.';

-- ─── 4. Rolling 7-day pitch totals view ─────────────────────────────────────
-- One row per (player, season, game_date) giving the inclusive-rolling pitches
-- over the previous 7 days ending at game_date. Consumed by the compliance UI
-- and the edge function's weekly-limit check.

create or replace view public.v_pitcher_rolling_7d
  with (security_invoker = true) as
select
  pc.player_id,
  pc.season_id,
  pc.game_date,
  sum(pc.pitch_count) over (
    partition by pc.player_id
    order by pc.game_date
    range between interval '6 days' preceding and current row
  )::int as pitches_7d,
  count(*) over (
    partition by pc.player_id
    order by pc.game_date
    range between interval '6 days' preceding and current row
  )::int as games_7d
from public.pitch_counts pc;

comment on view public.v_pitcher_rolling_7d is
  'Rolling 7-day window: pitches and games per player/season/game_date. Compare pitches_7d against rule max_pitches_per_week.';

-- ─── 5. Catcher innings tracking ────────────────────────────────────────────

create table public.catcher_innings (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references public.games(id) on delete cascade,
  player_id   uuid not null references public.players(id),
  season_id   uuid not null references public.seasons(id),
  game_date   date not null,
  innings_caught numeric(4,2) not null default 0
    check (innings_caught >= 0 and innings_caught <= 99),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(game_id, player_id)
);

comment on table public.catcher_innings is
  'Derived catcher workload per game. Mirrors pitch_counts shape. Populated by recompute_catcher_innings_for_game() from game_events substitutions.';

create index catcher_innings_player_date_idx
  on public.catcher_innings(player_id, game_date desc);

-- Helper: recompute catcher_innings for a single game by walking the substitution
-- event stream. Best-effort: looks for substitution events where newPosition ∈
-- ('C', 'catcher'). Each continuous stretch in that position counts whole innings
-- the player was active for the defensive half. Does not attempt to split half-innings.

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

  -- Authorization: only coaches of the game's team (or the service role) may
  -- recompute. Service role has NULL auth.uid() and is allowed through.
  if auth.uid() is not null and not public.is_coach(v_team_id, auth.uid()) then
    raise exception 'forbidden: recompute_catcher_innings requires coach role on team %', v_team_id
      using errcode = '42501';
  end if;

  -- Rebuild rows for this game. Delete then insert: cheap, atomic, idempotent.
  delete from public.catcher_innings where game_id = p_game_id;

  with sub_events as (
    select
      ge.sequence_number,
      ge.inning,
      ge.is_top_of_inning,
      (ge.payload->>'inPlayerId')::uuid as in_player_id,
      ge.payload->>'newPosition' as new_position
    from public.game_events ge
    where ge.game_id = p_game_id
      and ge.event_type = 'substitution'
      and ge.payload->>'newPosition' in ('C', 'catcher')
  ),
  -- Count defensive innings per player: one innings_caught unit per
  -- (inning, is_top_of_inning) combination seen while they were the catcher.
  -- A player who catches innings 1-7 as the home team catches the top half of
  -- each inning = 7 innings_caught.
  defensive_halves as (
    select distinct inning, is_top_of_inning, in_player_id
    from sub_events
  )
  insert into public.catcher_innings
    (game_id, player_id, season_id, game_date, innings_caught)
  select
    p_game_id,
    dh.in_player_id,
    v_season_id,
    v_game_date,
    count(*)::numeric(4,2)
  from defensive_halves dh
  where dh.in_player_id is not null
  group by dh.in_player_id;
end;
$$;

comment on function public.recompute_catcher_innings_for_game is
  'Recompute catcher_innings rows for a game from game_events substitutions. Idempotent. Counts defensive half-innings the player was substituted in as catcher.';

-- ─── 6. Triggers: keep updated_at current ───────────────────────────────────

create or replace function public.touch_player_compliance_rule_overrides_updated_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_pcro_touch_updated_at
  before update on public.player_compliance_rule_overrides
  for each row execute function public.touch_player_compliance_rule_overrides_updated_at();

create or replace function public.touch_catcher_innings_updated_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_catcher_innings_touch_updated_at
  before update on public.catcher_innings
  for each row execute function public.touch_catcher_innings_updated_at();

-- ─── 7. RLS ─────────────────────────────────────────────────────────────────

alter table public.player_compliance_rule_overrides enable row level security;
alter table public.catcher_innings enable row level security;

-- player_compliance_rule_overrides: coaches on player's team may manage.
create policy "pcro_coach_select"
  on public.player_compliance_rule_overrides for select
  using (
    exists (
      select 1 from public.players p
       where p.id = public.player_compliance_rule_overrides.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );

create policy "pcro_coach_write"
  on public.player_compliance_rule_overrides for all
  using (
    exists (
      select 1 from public.players p
       where p.id = public.player_compliance_rule_overrides.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.players p
       where p.id = public.player_compliance_rule_overrides.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );

-- catcher_innings: team members can read, coaches can write (though service role
-- via recompute is the normal write path).
create policy "catcher_innings_team_select"
  on public.catcher_innings for select
  using (
    exists (
      select 1 from public.players p
       where p.id = public.catcher_innings.player_id
         and exists (
           select 1 from public.team_members tm
            where tm.team_id = p.team_id
              and tm.user_id = auth.uid()
              and tm.is_active
         )
    )
  );

create policy "catcher_innings_coach_write"
  on public.catcher_innings for all
  using (
    exists (
      select 1 from public.players p
       where p.id = public.catcher_innings.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.players p
       where p.id = public.catcher_innings.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );
