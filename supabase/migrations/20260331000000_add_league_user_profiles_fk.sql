-- Add explicit FK constraints so PostgREST can resolve nested
-- user_profiles selects on league_channel_members and league_messages.

alter table public.league_channel_members
  add constraint league_channel_members_user_profiles_fk
  foreign key (user_id) references public.user_profiles(id) on delete cascade;

alter table public.league_messages
  add constraint league_messages_user_profiles_fk
  foreign key (sender_id) references public.user_profiles(id);
