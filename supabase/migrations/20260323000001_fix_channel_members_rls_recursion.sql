-- Fix infinite recursion in channel_members SELECT policy.
--
-- The old policy checked "can the user see this row?" by querying
-- channel_members itself, which triggered the same policy again.
--
-- Fix: use a SECURITY DEFINER function that bypasses RLS to check
-- membership, breaking the recursion cycle.

-- Helper: returns true if the user belongs to the given channel.
-- SECURITY DEFINER so it bypasses RLS on channel_members (breaks recursion).
CREATE OR REPLACE FUNCTION public.is_channel_member(p_channel_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.channel_members
    WHERE channel_id = p_channel_id
      AND user_id = p_user_id
  );
$$;

-- Drop the recursive policy and replace it
DROP POLICY IF EXISTS "channel_members_view_membership" ON public.channel_members;

CREATE POLICY "channel_members_view_membership"
  ON public.channel_members FOR SELECT
  USING (public.is_channel_member(channel_id, auth.uid()));

-- Also clean up duplicate seeded channels (keep the oldest per team + type + name)
DELETE FROM public.channels
WHERE id NOT IN (
  SELECT DISTINCT ON (team_id, channel_type, name) id
  FROM public.channels
  WHERE channel_type IN ('announcement', 'topic')
  ORDER BY team_id, channel_type, name, created_at ASC
);
