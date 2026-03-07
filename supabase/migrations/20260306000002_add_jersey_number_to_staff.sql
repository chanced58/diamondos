-- Add jersey_number to team_members (for confirmed staff/coaches)
alter table public.team_members
  add column if not exists jersey_number integer;

-- Add jersey_number to team_invitations (for pending staff invites)
alter table public.team_invitations
  add column if not exists jersey_number integer;
