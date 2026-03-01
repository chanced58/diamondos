-- Enable Supabase Realtime on tables needed for live features

-- Live scorekeeping: broadcast game state and events to all subscribers (parents, remote viewers)
alter publication supabase_realtime add table public.game_events;
alter publication supabase_realtime add table public.games;

-- Pitch count compliance: real-time alerts in scoring screen
alter publication supabase_realtime add table public.pitch_counts;

-- Messaging: real-time message delivery in channel threads
alter publication supabase_realtime add table public.messages;

-- Channel membership changes (e.g., added to a channel)
alter publication supabase_realtime add table public.channel_members;
