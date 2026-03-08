-- Allow created_by / sender_id / invited_by columns to be NULL so that
-- deleting a user from auth.users doesn't violate FK constraints.
-- NULL in these columns means "created by a deleted user."

ALTER TABLE teams ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE games ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE game_events ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE channels ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE team_invitations ALTER COLUMN invited_by DROP NOT NULL;
ALTER TABLE practices ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE team_events ALTER COLUMN created_by DROP NOT NULL;
