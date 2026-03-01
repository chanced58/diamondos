-- ============================================================
-- Migration: Add user management features
-- 1. Contact info on player records (email, phone)
-- 2. Platform admin flag on user_profiles
-- 3. Pending staff / player invitation tracking
-- ============================================================

-- 1. Contact info on player records
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text;

-- 2. Platform admin flag
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- 3. Pending staff/coach/player invitations
--    team_members requires a real auth.users FK so we can't store "ghost" rows there.
--    This table holds the invite data until the user accepts and creates their account.
CREATE TABLE IF NOT EXISTS public.team_invitations (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id     uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email       text NOT NULL,
  first_name  text,
  last_name   text,
  phone       text,
  role        public.team_role NOT NULL,
  invited_by  uuid NOT NULL REFERENCES auth.users(id),
  invited_at  timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  status      text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'cancelled')),
  UNIQUE(team_id, email)
);

ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;

-- Coaches can view invitations for their team
CREATE POLICY "coaches_view_invitations"
  ON public.team_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = public.team_invitations.team_id
        AND user_id = auth.uid()
        AND role IN ('head_coach', 'assistant_coach', 'athletic_director')
        AND is_active = true
    )
  );

-- Head coaches and athletic directors can insert invitations
CREATE POLICY "coaches_insert_invitations"
  ON public.team_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = public.team_invitations.team_id
        AND user_id = auth.uid()
        AND role IN ('head_coach', 'athletic_director')
        AND is_active = true
    )
  );

-- Head coaches and athletic directors can update invitations (cancel, resend)
CREATE POLICY "coaches_update_invitations"
  ON public.team_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_id = public.team_invitations.team_id
        AND user_id = auth.uid()
        AND role IN ('head_coach', 'athletic_director')
        AND is_active = true
    )
  );

-- 4. Platform admin RLS overrides
--    These policies allow platform admins to view all data regardless of team membership.

-- Platform admins can view all teams
CREATE POLICY "platform_admin_view_all_teams"
  ON public.teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- Platform admins can view all user profiles
CREATE POLICY "platform_admin_view_all_profiles"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- Platform admins can view all team members
CREATE POLICY "platform_admin_view_all_team_members"
  ON public.team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND is_platform_admin = true
    )
  );

-- Index for efficient invitation lookups
CREATE INDEX IF NOT EXISTS team_invitations_team_id_idx ON public.team_invitations(team_id);
CREATE INDEX IF NOT EXISTS team_invitations_email_idx ON public.team_invitations(email);
CREATE INDEX IF NOT EXISTS team_invitations_status_idx ON public.team_invitations(status);
