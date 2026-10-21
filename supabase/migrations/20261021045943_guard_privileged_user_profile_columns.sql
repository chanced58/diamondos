-- Lock the privileged columns of user_profiles.
--
-- `users_update_own_profile` lets a signed-in user UPDATE their own row, and
-- `authenticated` holds a table-level UPDATE grant, so until now a user could
-- set `is_platform_admin = true` on themselves straight from the client.
-- A column-level REVOKE cannot narrow a table-level grant, and narrowing the
-- table grant would break full-row upserts, so a guard trigger (the same shape
-- as guard_tournament_mode_permission) rejects changes to the privileged
-- columns from anything but trusted sessions:
--   * the service role (every web server action and API route that writes
--     these columns uses it),
--   * database-owner sessions (migrations, SQL console), and
--   * the auth service, whose handle_new_user upsert rewrites `email`.
-- Ordinary profile fields (name, phone, avatar) stay self-editable.

CREATE OR REPLACE FUNCTION public.guard_privileged_user_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_platform_admin IS NOT DISTINCT FROM OLD.is_platform_admin
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.has_set_password IS NOT DISTINCT FROM OLD.has_set_password THEN
    RETURN NEW;
  END IF;

  IF session_user IN ('postgres', 'supabase_admin', 'supabase_auth_admin')
     OR coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'is_platform_admin, email and has_set_password can only be changed by the server'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_privileged_user_profile_columns() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER user_profiles_guard_privileged_columns
  BEFORE UPDATE OF is_platform_admin, email, has_set_password ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_user_profile_columns();
