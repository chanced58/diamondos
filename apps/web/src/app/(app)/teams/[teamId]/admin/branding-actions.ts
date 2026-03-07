'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export async function uploadTeamBrandingAction(
  formData: FormData,
): Promise<{ error: string } | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated — please log in again.' };

  const teamId        = formData.get('teamId') as string;
  const primaryColor  = formData.get('primaryColor') as string;
  const secondaryColor = formData.get('secondaryColor') as string;
  const logoFile      = formData.get('logo') as File | null;

  if (!teamId || !logoFile) return { error: 'Missing required fields.' };

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify caller is head_coach or athletic_director for this team
  const { data: membership } = await db
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!membership || !['head_coach', 'assistant_coach', 'athletic_director'].includes(membership.role)) {
    return { error: 'Only coaches can update team branding.' };
  }

  // Determine file extension and build storage path
  const ext = logoFile.name.split('.').pop()?.toLowerCase() ?? 'png';
  const storagePath = `${teamId}/logo.${ext}`;

  // Ensure the bucket exists (idempotent — safe to call even if it already exists)
  const { error: bucketError } = await db.storage.createBucket('team-logos', { public: true });
  if (bucketError && !bucketError.message.toLowerCase().includes('already exists') && !bucketError.message.toLowerCase().includes('duplicate')) {
    return { error: `Storage setup failed: ${bucketError.message}` };
  }

  // Upload to Supabase Storage (upsert = overwrite on re-upload)
  const { error: uploadError } = await db.storage
    .from('team-logos')
    .upload(storagePath, logoFile, {
      upsert: true,
      contentType: logoFile.type,
    });

  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  // Get the public URL with cache-busting param to avoid stale browser cache
  const { data: { publicUrl } } = db.storage
    .from('team-logos')
    .getPublicUrl(storagePath);
  const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;

  // Persist logo URL (always safe — column exists in base schema)
  const { error: logoError } = await db
    .from('teams')
    .update({ logo_url: cacheBustedUrl, updated_at: new Date().toISOString() })
    .eq('id', teamId);

  if (logoError) return { error: `Failed to save logo: ${logoError.message}` };

  // Persist colors — these columns are added by migration 20260306000000.
  // If the migration hasn't been applied yet the update will fail silently so the
  // logo upload still succeeds.
  if (primaryColor || secondaryColor) {
    await db
      .from('teams')
      .update({
        primary_color:   primaryColor   || null,
        secondary_color: secondaryColor || null,
      })
      .eq('id', teamId);
  }

  revalidatePath('/', 'layout');
  return null;
}
