'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { canManageRoster } from '@/lib/roster-access';

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_PREFIXES = ['application/pdf', 'image/'];

function extFromMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

export async function uploadPlayerDocumentAction(_prev: string | null | undefined, formData: FormData) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const documentType = formData.get('documentType') as string;
  const title = (formData.get('title') as string)?.trim();
  const signedOn = (formData.get('signedOn') as string) || null;
  const expiresOn = (formData.get('expiresOn') as string) || null;
  const notes = (formData.get('notes') as string)?.trim() || null;
  const file = formData.get('file') as File | null;

  if (!teamId || !playerId || !documentType || !title) return 'Missing required fields.';
  if (!file || file.size === 0) return 'Please select a file to upload.';
  if (file.size > MAX_FILE_BYTES) return 'File too large (20 MB max).';
  if (!ALLOWED_MIME_PREFIXES.some((p) => file.type.startsWith(p))) {
    return 'Unsupported file type. Upload a PDF or image.';
  }

  if (!(await canManageRoster(teamId, user.id))) return 'Not authorized.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const docId = randomUUID();
  const ext = extFromMime(file.type);
  const storagePath = `${teamId}/${playerId}/${docId}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from('player-documents')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) return `Upload failed: ${uploadError.message}`;

  const { error: insertError } = await supabase.from('player_documents').insert({
    id: docId,
    team_id: teamId,
    player_id: playerId,
    document_type: documentType,
    title,
    storage_path: storagePath,
    signed_on: signedOn || null,
    expires_on: expiresOn || null,
    notes,
    uploaded_by: user.id,
    is_current: true,
  });

  if (insertError) {
    // Roll back the uploaded file so we don't leak orphaned objects.
    await supabase.storage.from('player-documents').remove([storagePath]);
    return `Save failed: ${insertError.message}`;
  }

  revalidatePath(`/teams/${teamId}/roster/${playerId}/documents`);
  return null;
}

export async function deletePlayerDocumentAction(
  _prev: string | null | undefined,
  formData: FormData,
) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const docId = formData.get('docId') as string;
  if (!teamId || !playerId || !docId) return 'Missing ids.';

  if (!(await canManageRoster(teamId, user.id))) return 'Not authorized.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing } = await supabase
    .from('player_documents')
    .select('storage_path, team_id')
    .eq('id', docId)
    .single();
  if (!existing || existing.team_id !== teamId) return 'Document not found.';

  await supabase.storage.from('player-documents').remove([existing.storage_path]);
  const { error } = await supabase.from('player_documents').delete().eq('id', docId);
  if (error) return `Delete failed: ${error.message}`;

  revalidatePath(`/teams/${teamId}/roster/${playerId}/documents`);
  return null;
}

export async function getDocumentDownloadUrl(docId: string, teamId: string): Promise<string | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  if (!(await canManageRoster(teamId, user.id))) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: doc } = await supabase
    .from('player_documents')
    .select('storage_path, team_id')
    .eq('id', docId)
    .single();
  if (!doc || doc.team_id !== teamId) return null;

  const { data: signed } = await supabase.storage
    .from('player-documents')
    .createSignedUrl(doc.storage_path, 60);
  return signed?.signedUrl ?? null;
}
