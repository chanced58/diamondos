-- Add cancellation support to practices
ALTER TABLE public.practices
  ADD COLUMN status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'cancelled'));
