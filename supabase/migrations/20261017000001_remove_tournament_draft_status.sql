-- Tournaments are live as soon as they are created; drop the 'draft' status.
--
-- tournaments.status defaulted to 'draft', but nothing ever moved a
-- tournament out of draft, so every new tournament showed as a draft.
-- Status is display-only (no function, policy or trigger reads it), so
-- existing drafts become 'active', new rows default to 'active', and 'draft'
-- is no longer an allowed value.

UPDATE public.tournaments SET status = 'active' WHERE status = 'draft';

ALTER TABLE public.tournaments ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE public.tournaments DROP CONSTRAINT tournaments_status_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_status_check CHECK (status IN ('active', 'completed', 'archived'));
