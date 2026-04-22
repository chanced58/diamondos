-- ============================================================================
-- Practice Engine — Tier 8
-- F2: Injury / availability flags + drill contraindications
--
--   * injury_flag_catalog — controlled vocabulary of injuries (system + team)
--   * player_injury_flags — date-bounded flags per player
--   * drill_injury_contraindications — drill × injury with severity
-- ============================================================================

create type public.injury_flag_visibility as enum ('system', 'team');
create type public.drill_injury_severity as enum ('hard', 'caution');

-- ─── 1. Injury catalog ──────────────────────────────────────────────────────

create table public.injury_flag_catalog (
  slug         text primary key,
  name         text not null,
  body_part    text not null,
  description  text,
  visibility   public.injury_flag_visibility not null default 'team',
  team_id      uuid references public.teams(id) on delete cascade,
  created_at   timestamptz not null default now(),
  check ((visibility = 'system' and team_id is null) or (visibility = 'team' and team_id is not null))
);

comment on table public.injury_flag_catalog is
  'Canonical injury/availability flags. System rows are read-only; teams may add their own variants.';

insert into public.injury_flag_catalog (slug, name, body_part, description, visibility)
values
  ('tender_arm',           'Tender arm',            'arm',         'Sore throwing arm, short of a medical diagnosis — avoid high-intensity throwing.', 'system'),
  ('shoulder_strain',      'Shoulder strain',       'shoulder',    'Diagnosed or suspected shoulder strain — avoid overhead throwing.',                'system'),
  ('elbow_inflammation',   'Elbow inflammation',    'elbow',       'UCL inflammation, medial elbow pain, or similar — avoid throwing load.',           'system'),
  ('lower_body_pull',      'Lower body pull',       'lower_body',  'Hamstring, groin, or hip pull — avoid sprinting, lateral plyo, and explosive starts.', 'system'),
  ('back_strain',          'Back strain',           'back',        'Avoid heavy rotational and loaded lifts; light activity OK.',                        'system'),
  ('concussion_protocol',  'Concussion protocol',   'head',        'Active concussion return-to-play protocol — no contact, no impact, no high HR work.', 'system'),
  ('wrist_hand',           'Wrist / hand',          'wrist_hand',  'Wrist or hand injury — avoid swinging and catching/fielding load.',                  'system'),
  ('knee',                 'Knee',                  'knee',        'Knee pain or post-injury return — avoid cutting, deep squats, catcher crouch.',      'system');

-- ─── 2. Per-player flags (date-bounded) ─────────────────────────────────────

create table public.player_injury_flags (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references public.players(id) on delete cascade,
  injury_slug     text not null references public.injury_flag_catalog(slug) on delete restrict,
  effective_from  date not null default current_date,
  effective_to    date,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

comment on table public.player_injury_flags is
  'Date-bounded injury flags per player. effective_to IS NULL means still active. Informs drill-suppression and lineup warnings.';

-- Only one open-ended flag per (player, injury_slug). Closed flags (with an
-- effective_to date) are historical and don't conflict.
create unique index player_injury_flags_one_open_per_slug
  on public.player_injury_flags(player_id, injury_slug)
  where effective_to is null;

create index player_injury_flags_player_idx
  on public.player_injury_flags(player_id, effective_from desc);

-- ─── 3. Drill contraindications ─────────────────────────────────────────────

create table public.drill_injury_contraindications (
  id            uuid primary key default gen_random_uuid(),
  drill_id      uuid not null references public.practice_drills(id) on delete cascade,
  injury_slug   text not null references public.injury_flag_catalog(slug) on delete restrict,
  severity      public.drill_injury_severity not null default 'hard',
  team_id       uuid references public.teams(id) on delete cascade,
  reason        text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

comment on table public.drill_injury_contraindications is
  'Indicates a drill is unsafe for a player with a given injury. Severity "hard" = always exclude; "caution" = exclude by default but overridable by coach.';

-- System-level rule (team_id null) can be overridden by a team-scoped row.
create unique index drill_injury_contraindications_unique
  on public.drill_injury_contraindications(drill_id, injury_slug, coalesce(team_id, '00000000-0000-0000-0000-000000000000'));

create index drill_injury_contraindications_injury_idx
  on public.drill_injury_contraindications(injury_slug, severity);

-- ─── 4. Triggers: touch updated_at ──────────────────────────────────────────

create or replace function public.touch_player_injury_flags_updated_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_player_injury_flags_touch
  before update on public.player_injury_flags
  for each row execute function public.touch_player_injury_flags_updated_at();

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────

alter table public.injury_flag_catalog enable row level security;
alter table public.player_injury_flags enable row level security;
alter table public.drill_injury_contraindications enable row level security;

-- Catalog: authenticated reads system rows; coaches read/write their team rows.
create policy "ifc_select_all"
  on public.injury_flag_catalog for select
  using (
    visibility = 'system'
    or (visibility = 'team' and public.is_coach(team_id, auth.uid()))
    or (
      visibility = 'team'
      and exists (
        select 1 from public.team_members tm
         where tm.team_id = public.injury_flag_catalog.team_id
           and tm.user_id = auth.uid()
           and tm.is_active
      )
    )
  );

create policy "ifc_coach_write"
  on public.injury_flag_catalog for all
  using (visibility = 'team' and public.is_coach(team_id, auth.uid()))
  with check (visibility = 'team' and public.is_coach(team_id, auth.uid()));

-- player_injury_flags: coaches manage; players/parents read active flags (without notes).
create policy "pif_coach_select"
  on public.player_injury_flags for select
  using (
    exists (
      select 1 from public.players p
       where p.id = public.player_injury_flags.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );

create policy "pif_parent_select"
  on public.player_injury_flags for select
  using (
    exists (
      select 1 from public.parent_player_links ppl
       where ppl.player_id = public.player_injury_flags.player_id
         and ppl.parent_user_id = auth.uid()
    )
  );

create policy "pif_player_select"
  on public.player_injury_flags for select
  using (
    exists (
      select 1 from public.players p
       where p.id = public.player_injury_flags.player_id
         and p.user_id = auth.uid()
    )
  );

create policy "pif_coach_write"
  on public.player_injury_flags for all
  using (
    exists (
      select 1 from public.players p
       where p.id = public.player_injury_flags.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.players p
       where p.id = public.player_injury_flags.player_id
         and public.is_coach(p.team_id, auth.uid())
    )
  );

-- drill_injury_contraindications: anyone reads relevant rows; coaches write team rows.
create policy "dic_select_all"
  on public.drill_injury_contraindications for select
  using (
    team_id is null
    or exists (
      select 1 from public.team_members tm
       where tm.team_id = public.drill_injury_contraindications.team_id
         and tm.user_id = auth.uid()
         and tm.is_active
    )
  );

create policy "dic_coach_write"
  on public.drill_injury_contraindications for all
  using (team_id is not null and public.is_coach(team_id, auth.uid()))
  with check (team_id is not null and public.is_coach(team_id, auth.uid()));
