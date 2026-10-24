-- Derive league channel membership from league and team rosters.
--
-- Until now only league staff were ever added to `league_channel_members`
-- (by league setup, the platform-admin league actions and the staff invite
-- route), so coaches of member teams never saw league channels and league
-- announcements reached nobody but staff.
--
-- Membership is now derived for every announcement and topic channel
-- (direct channels are left alone):
--   * active league staff (admins and managers) are members with can_post;
--   * active head coaches, assistant coaches and athletic directors of every
--     active `league_members` team are read-only members;
--   * anyone else is removed.
-- Triggers on each table that decides eligibility keep it current, so no
-- write path (web actions, client-side league admin writes, edge functions)
-- can skip it:
--   * league_channels  — a new channel gets every eligible member;
--   * league_members   — a team joining, leaving or being toggled re-syncs
--                        the team's users;
--   * team_members     — a coach joining, leaving or changing role re-syncs
--                        that user in each of the team's leagues;
--   * league_staff     — a staff change re-syncs that user (a removed admin
--                        who still coaches a member team drops to read-only).
--
-- Because can_post is now derived, members can no longer change it: the
-- `league_channel_members_update_own` policy lets a member update their own
-- row (for last_read_at), and it would otherwise let a read-only coach grant
-- themselves posting rights.

-- ─── Eligibility ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.league_channel_eligible_members(p_league_id uuid)
RETURNS TABLE (user_id uuid, can_post boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT eligible.user_id, bool_or(eligible.is_staff) AS can_post
  FROM (
    SELECT ls.user_id, true AS is_staff
    FROM public.league_staff ls
    WHERE ls.league_id = p_league_id
      AND ls.is_active
    UNION ALL
    SELECT tm.user_id, false AS is_staff
    FROM public.league_members lm
    JOIN public.team_members tm ON tm.team_id = lm.team_id
    WHERE lm.league_id = p_league_id
      AND lm.is_active
      AND tm.is_active
      AND tm.role IN ('head_coach', 'assistant_coach', 'athletic_director')
  ) eligible
  GROUP BY eligible.user_id;
$$;

-- Bring one user's membership of one league's channels in line with
-- league_channel_eligible_members: add or update it, or remove it.
CREATE OR REPLACE FUNCTION public.sync_league_channel_membership(p_league_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_can_post boolean;
BEGIN
  IF p_league_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT eligible.can_post INTO v_can_post
  FROM public.league_channel_eligible_members(p_league_id) eligible
  WHERE eligible.user_id = p_user_id;

  IF NOT FOUND THEN
    DELETE FROM public.league_channel_members lcm
    USING public.league_channels lc
    WHERE lc.id = lcm.league_channel_id
      AND lc.league_id = p_league_id
      AND lc.channel_type IN ('announcement', 'topic')
      AND lcm.user_id = p_user_id;
    RETURN;
  END IF;

  -- Update before inserting: merge_duplicate_league_channel_member skips
  -- duplicate inserts from trusted sessions, so an ON CONFLICT DO UPDATE
  -- here would never reach its UPDATE.
  UPDATE public.league_channel_members lcm
  SET can_post = v_can_post
  FROM public.league_channels lc
  WHERE lc.id = lcm.league_channel_id
    AND lc.league_id = p_league_id
    AND lc.channel_type IN ('announcement', 'topic')
    AND lcm.user_id = p_user_id
    AND lcm.can_post IS DISTINCT FROM v_can_post;

  INSERT INTO public.league_channel_members (league_channel_id, user_id, can_post)
  SELECT lc.id, p_user_id, v_can_post
  FROM public.league_channels lc
  WHERE lc.league_id = p_league_id
    AND lc.channel_type IN ('announcement', 'topic')
  ON CONFLICT (league_channel_id, user_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.league_channel_eligible_members(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_league_channel_membership(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ─── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.add_league_channel_eligible_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.channel_type NOT IN ('announcement', 'topic') THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.league_channel_members (league_channel_id, user_id, can_post)
  SELECT NEW.id, eligible.user_id, eligible.can_post
  FROM public.league_channel_eligible_members(NEW.league_id) eligible
  ON CONFLICT (league_channel_id, user_id) DO NOTHING;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_league_channels_for_league_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.team_id IS NOT NULL THEN
    PERFORM public.sync_league_channel_membership(OLD.league_id, team_user.user_id)
    FROM (SELECT DISTINCT tm.user_id FROM public.team_members tm WHERE tm.team_id = OLD.team_id) team_user;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.team_id IS NOT NULL THEN
    PERFORM public.sync_league_channel_membership(NEW.league_id, team_user.user_id)
    FROM (SELECT DISTINCT tm.user_id FROM public.team_members tm WHERE tm.team_id = NEW.team_id) team_user;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_league_channels_for_team_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Deleting a team cascades to its league_members and team_members rows
  -- before either table's trigger fires, so the team's leagues can no longer
  -- be found from league_members: also re-check every league whose channels
  -- the user is in.
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.sync_league_channel_membership(team_league.league_id, OLD.user_id)
    FROM (
      SELECT lm.league_id FROM public.league_members lm WHERE lm.team_id = OLD.team_id
      UNION
      SELECT lc.league_id
      FROM public.league_channel_members lcm
      JOIN public.league_channels lc ON lc.id = lcm.league_channel_id
      WHERE lcm.user_id = OLD.user_id
    ) team_league;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.sync_league_channel_membership(team_league.league_id, NEW.user_id)
    FROM (SELECT DISTINCT lm.league_id FROM public.league_members lm WHERE lm.team_id = NEW.team_id) team_league;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_league_channels_for_league_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.sync_league_channel_membership(OLD.league_id, OLD.user_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.sync_league_channel_membership(NEW.league_id, NEW.user_id);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.add_league_channel_eligible_members() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_league_channels_for_league_member() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_league_channels_for_team_member() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_league_channels_for_league_staff() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER league_channels_add_eligible_members
  AFTER INSERT ON public.league_channels
  FOR EACH ROW EXECUTE FUNCTION public.add_league_channel_eligible_members();

CREATE TRIGGER league_members_sync_league_channels
  AFTER INSERT OR DELETE OR UPDATE OF league_id, team_id, is_active ON public.league_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_league_channels_for_league_member();

CREATE TRIGGER team_members_sync_league_channels
  AFTER INSERT OR DELETE OR UPDATE OF team_id, user_id, role, is_active ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_league_channels_for_team_member();

CREATE TRIGGER league_staff_sync_league_channels
  AFTER INSERT OR DELETE OR UPDATE OF league_id, user_id, is_active ON public.league_staff
  FOR EACH ROW EXECUTE FUNCTION public.sync_league_channels_for_league_staff();

-- ─── Backfill ────────────────────────────────────────────────────────────────

INSERT INTO public.league_channel_members (league_channel_id, user_id, can_post)
SELECT lc.id, eligible.user_id, eligible.can_post
FROM public.league_channels lc
CROSS JOIN LATERAL public.league_channel_eligible_members(lc.league_id) eligible
WHERE lc.channel_type IN ('announcement', 'topic')
ON CONFLICT (league_channel_id, user_id) DO UPDATE
  SET can_post = EXCLUDED.can_post
  WHERE public.league_channel_members.can_post IS DISTINCT FROM EXCLUDED.can_post;

-- ─── Explicit staff inserts ──────────────────────────────────────────────────

-- Service-role writers that still add league staff to a channel themselves
-- (web deployments from before this migration, and the create-league edge
-- function until it is redeployed) do so after the triggers above have
-- already added them, and would fail on unique(league_channel_id, user_id)
-- and roll back the league they are creating. For trusted sessions a
-- duplicate insert is skipped and the derived row stays as it is. Anyone
-- else still gets the unique violation (or RLS error) they always did.
--
-- Not SECURITY DEFINER, so current_user is the role that ran the INSERT:
-- the service role, or the function owner inside the definer functions above.
CREATE OR REPLACE FUNCTION public.merge_duplicate_league_channel_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.league_channel_members lcm
    WHERE lcm.league_channel_id = NEW.league_channel_id
      AND lcm.user_id = NEW.user_id
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_duplicate_league_channel_member() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER league_channel_members_merge_duplicate
  BEFORE INSERT ON public.league_channel_members
  FOR EACH ROW EXECUTE FUNCTION public.merge_duplicate_league_channel_member();

-- ─── can_post guard ──────────────────────────────────────────────────────────

-- Same reasoning as guard_privileged_user_profile_columns: a column-level
-- REVOKE cannot narrow the table-level UPDATE grant. Not SECURITY DEFINER for
-- the same reason as above — the sync functions run as their owner.
CREATE OR REPLACE FUNCTION public.guard_league_channel_member_can_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.can_post IS NOT DISTINCT FROM OLD.can_post THEN
    RETURN NEW;
  END IF;

  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'League channel posting rights can only be changed by the server'
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_league_channel_member_can_post() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER league_channel_members_guard_can_post
  BEFORE UPDATE OF can_post ON public.league_channel_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_league_channel_member_can_post();
