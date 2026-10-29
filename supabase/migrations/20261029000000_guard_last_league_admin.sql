-- A league never loses its last active league admin.
--
-- The league staff service refuses an admin removing their own seat, but two
-- admins removing each other at the same moment would each pass that check
-- and leave the league with no admin. This trigger closes it in the database:
-- deleting, demoting, deactivating or moving an active league_admin seat is
-- refused when no other active admin of the league remains. It locks the
-- league row first, so concurrent removals in one league run one at a time and
-- the second sees the first's result.
--
-- Deleting the league itself still works: its staff go by ON DELETE CASCADE,
-- by which point the league row is gone and the guard lets the seat go.

CREATE OR REPLACE FUNCTION public.guard_last_league_admin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.role <> 'league_admin' OR NOT OLD.is_active THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.role = 'league_admin' AND NEW.is_active AND NEW.league_id = OLD.league_id THEN
    RETURN NEW;
  END IF;

  -- The league is being deleted (cascade): nothing to protect.
  PERFORM 1 FROM public.leagues WHERE id = OLD.league_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.league_staff
    WHERE league_id = OLD.league_id
      AND id <> OLD.id
      AND role = 'league_admin'
      AND is_active
  ) THEN
    RAISE EXCEPTION 'A league must keep at least one league admin.'
      USING ERRCODE = 'P0001', HINT = 'last_league_admin';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS league_staff_guard_last_admin ON public.league_staff;
CREATE TRIGGER league_staff_guard_last_admin
  BEFORE DELETE OR UPDATE OF role, is_active, league_id ON public.league_staff
  FOR EACH ROW EXECUTE FUNCTION public.guard_last_league_admin();
