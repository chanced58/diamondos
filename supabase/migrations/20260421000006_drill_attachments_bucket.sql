-- ============================================================================
-- Practice Engine — Tier 1 MVP
-- Migration 6: drill-attachments Supabase Storage bucket + policies
-- ============================================================================
--
-- Folder convention: <team_id>/<drill_id>/<uuid>.<ext>
-- The first path segment is the owning team id; RLS policies key off it.

insert into storage.buckets (id, name, public)
values ('drill-attachments', 'drill-attachments', false)
on conflict (id) do nothing;

-- SELECT: any team member of <team_id> can read objects under <team_id>/*
create policy "drill_attachments_team_members_read"
  on storage.objects for select
  using (
    bucket_id = 'drill-attachments'
    and (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and exists (
      select 1 from public.team_members tm
      where tm.team_id = (string_to_array(name, '/'))[1]::uuid
        and tm.user_id = auth.uid()
        and tm.is_active = true
    )
  );

-- INSERT / UPDATE / DELETE: only coaches on the owning team
create policy "drill_attachments_coach_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'drill-attachments'
    and (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.is_coach((string_to_array(name, '/'))[1]::uuid, auth.uid())
  );

create policy "drill_attachments_coach_update"
  on storage.objects for update
  using (
    bucket_id = 'drill-attachments'
    and (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.is_coach((string_to_array(name, '/'))[1]::uuid, auth.uid())
  )
  with check (
    bucket_id = 'drill-attachments'
    and (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.is_coach((string_to_array(name, '/'))[1]::uuid, auth.uid())
  );

create policy "drill_attachments_coach_delete"
  on storage.objects for delete
  using (
    bucket_id = 'drill-attachments'
    and (string_to_array(name, '/'))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    and public.is_coach((string_to_array(name, '/'))[1]::uuid, auth.uid())
  );
