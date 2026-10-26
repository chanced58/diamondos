-- The children a parent invitation was sent for. Accepting the invitation
-- links the parent to exactly these players (lib/auth/process-invite.ts);
-- the invite link's player list no longer decides it. NULL marks invitations
-- created before this column (and non-parent ones), which keep the old rule:
-- the link's players, held to the invited team's active players.
alter table public.team_invitations
  add column if not exists player_ids uuid[];

comment on column public.team_invitations.player_ids is
  'Parent invitations: the players the parent is linked to on acceptance. NULL for other roles and for invitations created before the column.';
