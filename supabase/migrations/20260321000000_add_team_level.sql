-- Add competitive level to teams so the stats panel can auto-configure
-- which stat tiers and columns to show (youth, high school, college/pro).

ALTER TABLE public.teams
ADD COLUMN level text NOT NULL DEFAULT 'high_school'
CONSTRAINT teams_level_check CHECK (level IN ('youth', 'middle_school', 'high_school', 'college', 'pro'));

COMMENT ON COLUMN public.teams.level IS 'Competitive level: youth (8-12), middle_school (13-14), high_school (NFHS), college (NCAA), pro';
