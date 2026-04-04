-- Add FK constraint so PostgREST can resolve nested user_profiles selects on league_staff.
-- This was missed in 20260331000000_add_league_user_profiles_fk.sql which covered
-- league_channel_members and league_messages but not league_staff.

alter table public.league_staff
  add constraint league_staff_user_profiles_fk
  foreign key (user_id) references public.user_profiles(id) on delete cascade;
