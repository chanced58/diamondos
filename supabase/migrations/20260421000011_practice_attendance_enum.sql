-- ============================================================================
-- Practice Engine — Tier 3A
-- Migration: attendance + notification enums
-- ============================================================================

create type public.practice_attendance_status as enum (
  'present',
  'absent',
  'late',
  'excused'
);

create type public.practice_notification_kind as enum (
  'pre_practice'
);

comment on type public.practice_attendance_status is
  'Coach-assigned attendance state for a player at a scheduled practice. Absence of an attendance row implies "pending" in the client.';

comment on type public.practice_notification_kind is
  'Category of system-generated practice notification. Extensible — new values appended for future tiers (e.g. post_practice_feedback).';
