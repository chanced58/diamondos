-- ============================================================================
-- Practice Engine — Tier 3A
-- Migration: per-team pre-practice push notification lead time
-- ============================================================================

alter table public.teams
  add column practice_notification_lead_minutes int not null default 120
    check (practice_notification_lead_minutes between 0 and 10080);

comment on column public.teams.practice_notification_lead_minutes is
  'Minutes before practice.scheduled_at to send the pre-practice push. 0 disables. Upper bound 10080 = 7 days.';
