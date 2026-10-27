'use server';

import { revalidatePath } from 'next/cache';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  deletePlayerDocument,
  playerDocumentUrl,
  uploadPlayerDocument,
} from '@/lib/services/roster/player-documents';

// Thin wrappers over lib/services/roster/player-documents, shared with the
// mobile /api/m/v1/teams/:teamId/players/:playerId/documents routes.

async function actor(): Promise<{ db: SupabaseClient; userId: string } | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  return { db, userId: user.id };
}

export async function uploadPlayerDocumentAction(_prev: string | null | undefined, formData: FormData) {
  const session = await actor();
  if (!session) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const file = formData.get('file');
  const result = await uploadPlayerDocument(
    session.db,
    session.userId,
    {
      teamId,
      playerId,
      documentType: formData.get('documentType'),
      title: formData.get('title'),
      signedOn: formData.get('signedOn'),
      expiresOn: formData.get('expiresOn'),
      notes: formData.get('notes'),
    },
    file instanceof File
      ? { size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) }
      : null,
  );
  if (!result.ok) return result.error;

  revalidatePath(`/teams/${teamId}/roster/${playerId}/documents`);
  return null;
}

export async function deletePlayerDocumentAction(
  _prev: string | null | undefined,
  formData: FormData,
) {
  const session = await actor();
  if (!session) return 'Not authenticated.';

  const teamId = formData.get('teamId') as string;
  const playerId = formData.get('playerId') as string;
  const result = await deletePlayerDocument(session.db, session.userId, {
    teamId,
    playerId,
    documentId: formData.get('docId'),
  });
  if (!result.ok) return result.error;

  revalidatePath(`/teams/${teamId}/roster/${playerId}/documents`);
  return null;
}

export async function getDocumentDownloadUrl(docId: string, teamId: string, playerId: string): Promise<string | null> {
  const session = await actor();
  if (!session) return null;
  const result = await playerDocumentUrl(session.db, session.userId, { teamId, playerId, documentId: docId });
  return result.ok ? result.data.url : null;
}
