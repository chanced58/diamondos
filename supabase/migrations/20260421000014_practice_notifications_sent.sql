-- ============================================================================
-- Practice Engine — Tier 3A
-- Migration: idempotency log for the practice push pipeline
-- ============================================================================
--
-- The dispatch edge function writes one row per (practice, user, kind) BEFORE
-- invoking the push delivery. The unique constraint guarantees a user will
-- never receive the same kind twice for the same practice, even if the cron
-- fires multiple times before the push API returns.

create table public.practice_notifications_sent (
  id            uuid primary key default gen_random_uuid(),
  practice_id   uuid not null references public.practices(id) on delete cascade,
  user_id       uuid not null references auth.users(id)       on delete cascade,
  kind          public.practice_notification_kind not null,
  sent_at       timestamptz not null default now(),
  unique (practice_id, user_id, kind)
);

comment on table public.practice_notifications_sent is
  'One row per (practice, user, kind) once a push has been queued. Guarantees idempotency across cron invocations.';

create index idx_practice_notifications_sent_practice_kind
  on public.practice_notifications_sent(practice_id, kind);

alter table public.practice_notifications_sent enable row level security;

-- No client access. Written by the edge function using the service-role key,
-- which bypasses RLS. Clients have no reason to see this log.
create policy "practice_notifications_sent_no_client_access"
  on public.practice_notifications_sent for all
  using (false)
  with check (false);
