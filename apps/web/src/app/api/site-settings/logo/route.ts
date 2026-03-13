import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/site-settings/logo — uploads a logo to site-assets bucket.
 * Platform admin only. Accepts multipart form data with a "file" field.
 */
export async function POST(request: NextRequest) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify platform admin
  const { data: profile } = await db
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use PNG, JPEG, SVG, or WebP.' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 5 MB.' }, { status: 400 });
  }

  // Upload with a stable path so re-uploads overwrite
  const ext = file.name.split('.').pop() ?? 'png';
  const path = `logo/site-logo.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await db.storage
    .from('site-assets')
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
  }

  // Get the public URL
  const { data: urlData } = db.storage.from('site-assets').getPublicUrl(path);
  const logoUrl = urlData.publicUrl;

  // Update site_settings with the new logo URL
  await db
    .from('site_settings')
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', 'default');

  return NextResponse.json({ logo_url: logoUrl });
}

/**
 * DELETE /api/site-settings/logo — removes the logo.
 */
export async function DELETE() {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  // Clear the logo_url in site_settings
  await db
    .from('site_settings')
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq('id', 'default');

  // Best-effort: remove file from storage
  await db.storage.from('site-assets').remove(['logo/site-logo.png', 'logo/site-logo.jpg', 'logo/site-logo.jpeg', 'logo/site-logo.svg', 'logo/site-logo.webp']);

  return NextResponse.json({ success: true });
}
