import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * GET /api/site-settings — public, returns the singleton site settings row.
 */
export async function GET() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await db
    .from('site_settings')
    .select('*')
    .eq('id', 'default')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }

  return NextResponse.json(data);
}

/**
 * PATCH /api/site-settings — platform admin only, updates site settings.
 */
export async function PATCH(request: NextRequest) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify platform admin
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Allowlisted fields
  const allowed = [
    'site_name', 'logo_url',
    'primary_color', 'secondary_color', 'accent_color',
    'hero_headline', 'hero_subtext', 'cta_button_text',
    'form_headline', 'form_subtext',
  ];

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) {
      updates[key] = body[key];
    }
  }

  const { data, error } = await db
    .from('site_settings')
    .update(updates)
    .eq('id', 'default')
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }

  return NextResponse.json(data);
}
