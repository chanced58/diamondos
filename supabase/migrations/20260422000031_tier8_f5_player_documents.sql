-- ============================================================================
-- Practice Engine — Tier 8
-- F5: Liability/waiver tracking (coach-uploaded signed PDFs)
--
-- Folder convention: <team_id>/<player_id>/<doc_id>.<ext>
-- Folder segments 1 and 2 both drive RLS:
--   * coaches on <team_id> read/write
--   * parents linked via parent_player_links to <player_id> read
--   * players with user_id matching <player_id>.user_id read
-- ============================================================================

-- ─── 1. Storage bucket ──────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('player-documents', 'player-documents', false)
on conflict (id) do nothing;

-- Helper to pull the UUID from path segment N and reject malformed paths.
create or replace function public.player_documents_path_uuid(p_name text, p_segment int)
  returns uuid
  language sql
  immutable
  set search_path = public, pg_temp
as $$
  select case
    when (string_to_array(p_name, '/'))[p_segment] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then (string_to_array(p_name, '/'))[p_segment]::uuid
    else null
  end;
$$;

create policy "player_documents_coach_read"
  on storage.objects for select
  using (
    bucket_id = 'player-documents'
    and public.is_coach(public.player_documents_path_uuid(name, 1), auth.uid())
  );

create policy "player_documents_parent_read"
  on storage.objects for select
  using (
    bucket_id = 'player-documents'
    and exists (
      select 1 from public.parent_player_links ppl
       where ppl.player_id = public.player_documents_path_uuid(name, 2)
         and ppl.parent_user_id = auth.uid()
    )
  );

create policy "player_documents_self_read"
  on storage.objects for select
  using (
    bucket_id = 'player-documents'
    and exists (
      select 1 from public.players p
       where p.id = public.player_documents_path_uuid(name, 2)
         and p.user_id = auth.uid()
    )
  );

create policy "player_documents_coach_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'player-documents'
    and public.is_coach(public.player_documents_path_uuid(name, 1), auth.uid())
  );

create policy "player_documents_coach_update"
  on storage.objects for update
  using (
    bucket_id = 'player-documents'
    and public.is_coach(public.player_documents_path_uuid(name, 1), auth.uid())
  )
  with check (
    bucket_id = 'player-documents'
    and public.is_coach(public.player_documents_path_uuid(name, 1), auth.uid())
  );

create policy "player_documents_coach_delete"
  on storage.objects for delete
  using (
    bucket_id = 'player-documents'
    and public.is_coach(public.player_documents_path_uuid(name, 1), auth.uid())
  );

-- ─── 2. Document type catalog ───────────────────────────────────────────────

create type public.player_document_visibility as enum ('system', 'team');

create table public.player_document_type (
  slug                  text primary key,
  name                  text not null,
  description           text,
  requires_expiration   boolean not null default false,
  visibility            public.player_document_visibility not null default 'team',
  team_id               uuid references public.teams(id) on delete cascade,
  created_at            timestamptz not null default now(),
  -- System rows have no team; team rows must name one
  check ((visibility = 'system' and team_id is null) or (visibility = 'team' and team_id is not null))
);

comment on table public.player_document_type is
  'Categorizes player documents (waiver, medical release, consent, etc.). System seeds are read-only; teams may add their own.';

-- System seeds: the common admin/compliance docs.
insert into public.player_document_type (slug, name, description, requires_expiration, visibility)
values
  ('liability_waiver',  'Liability waiver',       'Parent/guardian-signed release of liability.', true,  'system'),
  ('medical_release',   'Medical release',        'Authorization for emergency medical treatment.', true,  'system'),
  ('parent_consent',    'Parent consent',         'General parent consent for participation and travel.', true,  'system'),
  ('code_of_conduct',   'Code of conduct',        'Signed acknowledgment of team/league code of conduct.', false, 'system'),
  ('insurance_card',    'Insurance card',         'Copy of primary health insurance card.', false, 'system'),
  ('birth_certificate', 'Birth certificate',      'Proof of age for league eligibility (Little League, travel).', false, 'system'),
  ('concussion_ack',    'Concussion acknowledgment', 'State-required concussion education acknowledgment.', true,  'system');

-- ─── 3. Documents table ─────────────────────────────────────────────────────

create table public.player_documents (
  id              uuid primary key default gen_random_uuid(),
  team_id         uuid not null references public.teams(id) on delete cascade,
  player_id       uuid not null references public.players(id) on delete cascade,
  document_type   text not null references public.player_document_type(slug) on delete restrict,
  title           text not null,
  storage_path    text not null,  -- Full <team_id>/<player_id>/<doc_id>.<ext>
  signed_on       date,
  expires_on      date,
  uploaded_by     uuid references auth.users(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  notes           text,
  is_current      boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (expires_on is null or signed_on is null or expires_on >= signed_on)
);

comment on table public.player_documents is
  'Uploaded compliance documents per player. New uploads of the same type flip older rows'' is_current to false (see trigger).';

create index player_documents_team_current_idx
  on public.player_documents(team_id, is_current)
  where is_current;

create index player_documents_player_idx
  on public.player_documents(player_id, document_type, uploaded_at desc);

-- Enforce one current document per (player, document_type). Superseding an old
-- doc happens through the trigger below, not via a manual UPDATE.
create unique index player_documents_one_current_per_type
  on public.player_documents(player_id, document_type)
  where is_current;

-- ─── 4. Supersede trigger: flips older rows to is_current=false ─────────────

create or replace function public.player_documents_supersede_previous()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if new.is_current then
    update public.player_documents
       set is_current = false,
           updated_at = now()
     where player_id = new.player_id
       and document_type = new.document_type
       and id <> new.id
       and is_current;
  end if;
  return new;
end;
$$;

create trigger trg_player_documents_supersede
  before insert or update of is_current on public.player_documents
  for each row execute function public.player_documents_supersede_previous();

create or replace function public.touch_player_documents_updated_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_player_documents_touch_updated_at
  before update on public.player_documents
  for each row execute function public.touch_player_documents_updated_at();

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────

alter table public.player_document_type enable row level security;
alter table public.player_documents enable row level security;

-- Document type catalog: anyone authenticated reads system rows; coaches
-- read/write their team's rows.
create policy "pdt_select_all"
  on public.player_document_type for select
  using (
    visibility = 'system'
    or (visibility = 'team' and public.is_coach(team_id, auth.uid()))
    or (
      visibility = 'team'
      and exists (
        select 1 from public.team_members tm
         where tm.team_id = public.player_document_type.team_id
           and tm.user_id = auth.uid()
           and tm.is_active
      )
    )
  );

create policy "pdt_coach_write"
  on public.player_document_type for all
  using (
    visibility = 'team' and public.is_coach(team_id, auth.uid())
  )
  with check (
    visibility = 'team' and public.is_coach(team_id, auth.uid())
  );

-- player_documents: coaches manage. Parents read their linked kid's docs.
-- Players read their own. Notes are coach-only — see policy below.
create policy "pd_coach_select"
  on public.player_documents for select
  using (public.is_coach(team_id, auth.uid()));

create policy "pd_parent_select"
  on public.player_documents for select
  using (
    exists (
      select 1 from public.parent_player_links ppl
       where ppl.player_id = public.player_documents.player_id
         and ppl.parent_user_id = auth.uid()
    )
  );

create policy "pd_player_select"
  on public.player_documents for select
  using (
    exists (
      select 1 from public.players p
       where p.id = public.player_documents.player_id
         and p.user_id = auth.uid()
    )
  );

create policy "pd_coach_write"
  on public.player_documents for all
  using (public.is_coach(team_id, auth.uid()))
  with check (public.is_coach(team_id, auth.uid()));
