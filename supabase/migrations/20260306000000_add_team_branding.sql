-- Add branding columns to teams for per-team sidebar theming

alter table public.teams
  add column if not exists primary_color   text,
  add column if not exists secondary_color text;

-- Create public storage bucket for team logos
insert into storage.buckets (id, name, public)
  values ('team-logos', 'team-logos', true)
  on conflict (id) do nothing;

-- Allow authenticated users to upload to team-logos bucket
create policy "authenticated users can upload team logos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'team-logos');

-- Allow authenticated users to update (replace) team logos
create policy "authenticated users can update team logos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'team-logos');

-- Allow anyone to read team logos (bucket is public)
create policy "anyone can view team logos"
  on storage.objects for select
  using (bucket_id = 'team-logos');
