-- User training & certification
--
-- training_module_completions: per-module completion log (resume + audit trail).
-- user_certifications:         present row == user has the "Certified" badge for the given curriculum version.
--
-- Trust model: writes are client-initiated; RLS allows users to insert their own rows only.
-- Curriculum content lives in @baseball/shared. If we ever need server-side answer validation,
-- replace the direct insert path with an edge function.

create table public.training_module_completions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  module_slug         text not null,
  curriculum_version  text not null,
  completed_at        timestamptz not null default now(),
  unique (user_id, module_slug, curriculum_version)
);

create index idx_training_module_completions_user
  on public.training_module_completions(user_id);

create table public.user_certifications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  curriculum_version  text not null,
  certified_at        timestamptz not null default now(),
  unique (user_id, curriculum_version)
);

create index idx_user_certifications_user
  on public.user_certifications(user_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.training_module_completions enable row level security;
alter table public.user_certifications         enable row level security;

-- Module completions: private to the user.
create policy "users_view_own_completions"
  on public.training_module_completions for select
  using (user_id = auth.uid());

create policy "users_insert_own_completions"
  on public.training_module_completions for insert
  with check (user_id = auth.uid());

-- Certifications: own row, teammates, and league staff over the user's leagues can read.
create policy "users_view_own_certification"
  on public.user_certifications for select
  using (user_id = auth.uid());

create policy "teammates_view_certification"
  on public.user_certifications for select
  using (
    exists (
      select 1 from public.team_members tm1
      join public.team_members tm2 on tm1.team_id = tm2.team_id
      where tm1.user_id = auth.uid()
        and tm2.user_id = public.user_certifications.user_id
        and tm1.is_active = true
        and tm2.is_active = true
    )
  );

create policy "league_staff_view_certification"
  on public.user_certifications for select
  using (
    exists (
      select 1
      from public.team_members tm
      join public.league_members lm on lm.team_id = tm.team_id
      join public.league_staff   ls on ls.league_id = lm.league_id
      where tm.user_id = public.user_certifications.user_id
        and tm.is_active = true
        and lm.is_active = true
        and ls.user_id = auth.uid()
        and ls.is_active = true
    )
  );

create policy "users_insert_own_certification"
  on public.user_certifications for insert
  with check (user_id = auth.uid());

-- No update/delete policies on either table: rows are write-once.
