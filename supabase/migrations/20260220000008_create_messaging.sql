-- Messaging: channels, messages, RSVPs, and push notification tokens

create type public.channel_type as enum (
  'announcement',   -- Coaches post only; all team members receive
  'topic',          -- Threaded discussion with role-based posting
  'direct'          -- 1:1 between two users
);

create type public.rsvp_status as enum (
  'attending',
  'not_attending',
  'maybe'
);

create table public.channels (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  channel_type  public.channel_type not null,
  name          text,           -- null for direct channels
  description   text,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.channel_members (
  id            uuid primary key default gen_random_uuid(),
  channel_id    uuid not null references public.channels(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  can_post      boolean not null default false,  -- false for parents/players in announcement channels
  last_read_at  timestamptz,
  joined_at     timestamptz not null default now(),
  unique(channel_id, user_id)
);

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  channel_id  uuid not null references public.channels(id) on delete cascade,
  sender_id   uuid not null references auth.users(id),
  body        text not null,
  parent_id   uuid references public.messages(id) on delete set null, -- thread reply
  is_pinned   boolean not null default false,
  edited_at   timestamptz,
  deleted_at  timestamptz,                      -- soft delete; body blanked but row kept for threading
  created_at  timestamptz not null default now()
);

-- RSVP tracking for scheduled games
create table public.game_rsvps (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        public.rsvp_status not null,
  note          text,
  responded_at  timestamptz not null default now(),
  unique(game_id, user_id)
);

-- Expo push notification tokens registered by mobile clients
create table public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios', 'android')),
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
