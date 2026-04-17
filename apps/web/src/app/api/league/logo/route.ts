import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

/**
 * POST /api/league/logo — uploads a league logo to the league-logos bucket.
 * League staff only. Accepts multipart form data with "file" and "leagueId" fields.
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

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const leagueId = formData.get('leagueId') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!leagueId) {
    return NextResponse.json({ error: 'No leagueId provided' }, { status: 400 });
  }

  // Verify user is league admin
  const { data: staffRow } = await db
    .from('league_staff')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('role', 'league_admin')
    .maybeSingle();

  if (!staffRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. Use PNG, JPEG, SVG, or WebP.' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 5 MB.' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'png';
  const path = `${leagueId}/logo.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await db.storage
    .from('league-logos')
    .upload(path, arrayBuffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 });
  }

  const { data: urlData } = db.storage.from('league-logos').getPublicUrl(path);

  return NextResponse.json({ logo_url: urlData.publicUrl });
}
