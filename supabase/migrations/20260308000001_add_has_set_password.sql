-- Track whether a user has completed the password-setup flow.
-- Defaults to false so all existing (magic-link only) users are prompted
-- to set a password on their next login.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS has_set_password boolean NOT NULL DEFAULT false;
