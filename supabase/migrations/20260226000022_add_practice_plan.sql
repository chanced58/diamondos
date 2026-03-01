-- Add practice plan column to practices table
-- Coaches can write the plan for an upcoming practice; all team members can read it.
ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS plan text;
