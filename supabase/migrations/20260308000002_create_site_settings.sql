-- Site-wide settings for branding the public home page and lead capture form.
-- Singleton row pattern: only one row (id = 'default') is allowed.

CREATE TABLE IF NOT EXISTS public.site_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  -- Branding
  logo_url       TEXT,
  site_name      TEXT NOT NULL DEFAULT 'DiamondOS',
  -- Colors (hex values)
  primary_color  TEXT NOT NULL DEFAULT '#1e3a8a',
  secondary_color TEXT NOT NULL DEFAULT '#1d4ed8',
  accent_color   TEXT NOT NULL DEFAULT '#eff6ff',
  -- Home page messaging
  hero_headline  TEXT NOT NULL DEFAULT 'The coaching platform built for baseball.',
  hero_subtext   TEXT NOT NULL DEFAULT 'Scorekeeping, communication, practice planning, and compliance — all in one place.',
  cta_button_text TEXT NOT NULL DEFAULT 'Get Early Access',
  -- Form messaging
  form_headline  TEXT NOT NULL DEFAULT 'Get started for free',
  form_subtext   TEXT NOT NULL DEFAULT 'Enter your email and we''ll keep you updated.',
  -- Timestamps
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the default row
INSERT INTO public.site_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;

-- RLS: public can read, only platform admins can update
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read site settings"
  ON public.site_settings FOR SELECT
  USING (true);

CREATE POLICY "Platform admins can update site settings"
  ON public.site_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_platform_admin = true
    )
  );

-- Storage bucket for site assets (logo uploads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-assets',
  'site-assets',
  true,
  5242880,  -- 5 MB
  ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: public read, platform admin upload/delete
CREATE POLICY "Public read site-assets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'site-assets');

CREATE POLICY "Platform admins upload site-assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'site-assets'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_platform_admin = true
    )
  );

CREATE POLICY "Platform admins delete site-assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'site-assets'
    AND EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.is_platform_admin = true
    )
  );
