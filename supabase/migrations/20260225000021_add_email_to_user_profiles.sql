-- Add email column to user_profiles, mirrored from auth.users.
-- Email is the canonical auth identifier and lives in auth.users; this column
-- provides a convenient join-free way to display it in app queries.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS email text;

-- Update the new-user trigger to also copy the email on account creation.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- Backfill email for all existing users who have a profile but no email yet.
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND up.email IS NULL;
