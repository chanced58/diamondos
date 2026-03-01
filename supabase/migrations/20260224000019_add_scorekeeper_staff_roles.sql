-- Add scorekeeper and staff roles to the team_role enum.
-- Scorekeepers can manage game scoring; staff are general team staff with roster access.

ALTER TYPE public.team_role ADD VALUE IF NOT EXISTS 'scorekeeper';
ALTER TYPE public.team_role ADD VALUE IF NOT EXISTS 'staff';
