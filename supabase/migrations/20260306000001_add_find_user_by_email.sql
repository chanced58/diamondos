-- Function to look up an auth user ID by email.
-- Needed because user_profiles.email may be null for users who signed up
-- before migration 20260225000021 was applied to the remote instance.
-- This lets server actions reliably find existing users regardless.
CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;

-- Also backfill user_profiles.email for any users who are still missing it.
UPDATE public.user_profiles up
SET email = au.email
FROM auth.users au
WHERE up.id = au.id
  AND (up.email IS NULL OR up.email = '');
