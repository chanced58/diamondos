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

  if (!teamId) return { error: 'Missing required fields.' };

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

  // If a logo file was provided, upload it and update the logo URL
  if (logoFile && logoFile.size > 0) {
    const ext = logoFile.name.split('.').pop()?.toLowerCase() ?? 'png';
    const storagePath = `${teamId}/logo.${ext}`;

    // Ensure the bucket exists (idempotent)
    const { error: bucketError } = await db.storage.createBucket('team-logos', { public: true });
    if (bucketError && !bucketError.message.toLowerCase().includes('already exists') && !bucketError.message.toLowerCase().includes('duplicate')) {
      return { error: `Storage setup failed: ${bucketError.message}` };
    }

    const { error: uploadError } = await db.storage
      .from('team-logos')
      .upload(storagePath, logoFile, { upsert: true, contentType: logoFile.type });

    if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

    const { data: { publicUrl } } = db.storage.from('team-logos').getPublicUrl(storagePath);
    const cacheBustedUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: logoError } = await db
      .from('teams')
      .update({ logo_url: cacheBustedUrl, updated_at: new Date().toISOString() })
      .eq('id', teamId);

    if (logoError) return { error: `Failed to save logo: ${logoError.message}` };
  }

  // Persist colors — always save when provided, even without a new logo
  if (primaryColor || secondaryColor) {
    const { error: colorError } = await db
      .from('teams')
      .update({
        primary_color:   primaryColor   || null,
        secondary_color: secondaryColor || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', teamId);

    if (colorError) return { error: `Failed to save colors: ${colorError.message}` };
  }

  revalidatePath('/', 'layout');
  return null;
}
