-- Add a direct FK from channel_members.user_id to user_profiles.id so PostgREST
-- can resolve the nested join: channels → channel_members → user_profiles.
-- Without this, the query `channel_members(user_id, user_profiles(first_name, last_name))`
-- fails with "Could not find a relationship between 'channel_members' and 'user_profiles'".

ALTER TABLE public.channel_members
  ADD CONSTRAINT channel_members_user_profile_fk
  FOREIGN KEY (user_id) REFERENCES public.user_profiles(id);
