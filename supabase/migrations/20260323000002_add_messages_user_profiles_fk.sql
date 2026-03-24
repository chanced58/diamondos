-- Add direct FK from messages.sender_id to user_profiles.id so PostgREST
-- can resolve the join: messages → user_profiles.
-- Same fix as 20260323000000 for channel_members → user_profiles.

ALTER TABLE public.messages
  ADD CONSTRAINT messages_user_profile_fk
  FOREIGN KEY (sender_id) REFERENCES public.user_profiles(id);
