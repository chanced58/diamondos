import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PLAYER_DOCUMENT_MAX_BYTES,
  documentExtension,
  isAllowedDocumentContentType,
  playerDocumentIdInputSchema,
  rosterPlayerIdInputSchema,
  uploadPlayerDocumentInputSchema,
  type PlayerDocumentUrlResponse,
  type PlayerDocumentWriteResponse,
  type PlayerDocumentsResponse,
} from '@baseball/shared';
import { authorizeManagedPlayer } from './authorize-player';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A player's documents (the web /teams/:teamId/roster/:playerId/documents
 * page): waivers, medical releases and other compliance files, shared by its
 * actions and the mobile `/api/m/v1/teams/:teamId/players/:playerId/documents`
 * routes. Roster managers only. Files live in the private `player-documents`
 * bucket at `<team_id>/<player_id>/<document_id>.<ext>`; a new upload of a type
 * supersedes the player's previous one (a database trigger).
 */

const BUCKET = 'player-documents';
/** How long a link to a file works. */
const SIGNED_URL_SECONDS = 60;

/** The uploaded file: its size and type are checked before its bytes are read. */
export interface PlayerDocumentFile {
  size: number;
  contentType: string;
  read: () => Promise<Uint8Array>;
}

function failed<T>(action: string, playerId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[player-documents] ${action} failed player=${playerId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

const authorizePlayer = (db: SupabaseClient, actorUserId: string, teamId: string, playerId: string) =>
  authorizeManagedPlayer(db, actorUserId, teamId, playerId, 'Only coaches can manage player documents.');

/** The types a team can upload: the system list and the team's own. `teamId` is a validated uuid. */
function documentTypesQuery(db: SupabaseClient, teamId: string, columns: string) {
  return db.from('player_document_type').select(columns).or(`visibility.eq.system,team_id.eq.${teamId}`);
}

export async function loadPlayerDocuments(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PlayerDocumentsResponse>> {
  const parsed = rosterPlayerIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId } = parsed.data;

  const player = await authorizePlayer(db, actorUserId, teamId, playerId);
  if (!player.ok) return player;

  const [typesResult, documentsResult] = await Promise.all([
    documentTypesQuery(db, teamId, 'slug, name, requires_expiration, visibility').order('name'),
    db
      .from('player_documents')
      .select('id, document_type, title, signed_on, expires_on, notes, uploaded_at, is_current')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .order('uploaded_at', { ascending: false }),
  ]);
  if (typesResult.error) return failed('loadPlayerDocuments', playerId, actorUserId, typesResult.error);
  if (documentsResult.error) return failed('loadPlayerDocuments', playerId, actorUserId, documentsResult.error);

  type TypeRow = { slug: string; name: string; requires_expiration: boolean; visibility: string };
  type DocumentRow = {
    id: string;
    document_type: string;
    title: string;
    signed_on: string | null;
    expires_on: string | null;
    notes: string | null;
    uploaded_at: string;
    is_current: boolean;
  };
  return serviceOk({
    player: {
      id: player.data.id,
      firstName: player.data.first_name,
      lastName: player.data.last_name,
      jerseyNumber: player.data.jersey_number,
    },
    documentTypes: ((typesResult.data ?? []) as unknown as TypeRow[]).map((t) => ({
      slug: t.slug,
      name: t.name,
      requiresExpiration: t.requires_expiration,
      isTeamType: t.visibility === 'team',
    })),
    documents: ((documentsResult.data ?? []) as unknown as DocumentRow[]).map((d) => ({
      id: d.id,
      documentType: d.document_type,
      title: d.title,
      signedOn: d.signed_on,
      expiresOn: d.expires_on,
      notes: d.notes,
      uploadedAt: d.uploaded_at,
      isCurrent: d.is_current,
    })),
  });
}

/** Uploads a PDF or image (20 MB at most) and records it as the player's current document of its type. */
export async function uploadPlayerDocument(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
  file: PlayerDocumentFile | null,
): Promise<ServiceResult<PlayerDocumentWriteResponse>> {
  const parsed = uploadPlayerDocumentInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { teamId, playerId, documentType, title, signedOn, expiresOn, notes } = parsed.data;
  if (!file || file.size === 0) return serviceError('invalid', 'Pick a file to upload.');
  if (file.size > PLAYER_DOCUMENT_MAX_BYTES) return serviceError('invalid', 'That file is too large (20 MB max).');
  if (!isAllowedDocumentContentType(file.contentType)) return serviceError('invalid', 'Upload a PDF or an image.');

  const player = await authorizePlayer(db, actorUserId, teamId, playerId);
  if (!player.ok) return player;

  // Only the system types and this team's own, never another team's.
  const { data: type, error: typeError } = await documentTypesQuery(db, teamId, 'slug').eq('slug', documentType).limit(1).maybeSingle();
  if (typeError) return failed('uploadPlayerDocument', playerId, actorUserId, typeError);
  if (!type) return serviceError('invalid', 'Pick a document type from the list.');

  const documentId = randomUUID();
  const storagePath = `${teamId}/${playerId}/${documentId}.${documentExtension(file.contentType)}`;
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, await file.read(), { contentType: file.contentType, upsert: false });
  if (uploadError) return failed('uploadPlayerDocument', playerId, actorUserId, uploadError);

  const { error: insertError } = await db.from('player_documents').insert({
    id: documentId,
    team_id: teamId,
    player_id: playerId,
    document_type: documentType,
    title,
    storage_path: storagePath,
    signed_on: signedOn,
    expires_on: expiresOn,
    notes,
    uploaded_by: actorUserId,
    is_current: true,
  });
  if (insertError) {
    // Take the file back out so it isn't left behind without a record.
    const { error: removeError } = await db.storage.from(BUCKET).remove([storagePath]);
    if (removeError) console.error(`[player-documents] orphaned ${storagePath}:`, removeError);
    return failed('uploadPlayerDocument', playerId, actorUserId, insertError);
  }
  return serviceOk({ documentId });
}

/** The document's stored file, scoped to the authorized player and team. */
async function findDocument(
  db: SupabaseClient,
  actorUserId: string,
  action: string,
  input: { teamId: string; playerId: string; documentId: string },
): Promise<ServiceResult<{ storagePath: string }>> {
  const player = await authorizePlayer(db, actorUserId, input.teamId, input.playerId);
  if (!player.ok) return player;

  const { data, error } = await db
    .from('player_documents')
    .select('storage_path')
    .eq('id', input.documentId)
    .eq('player_id', input.playerId)
    .eq('team_id', input.teamId)
    .maybeSingle();
  if (error) return failed(action, input.playerId, actorUserId, error);
  if (!data) return serviceError('not_found', 'Document not found.');
  return serviceOk({ storagePath: (data as { storage_path: string }).storage_path });
}

/** Deletes the record, then its file; a file left behind is logged, not refused. */
export async function deletePlayerDocument(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PlayerDocumentWriteResponse>> {
  const parsed = playerDocumentIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { playerId, documentId } = parsed.data;

  const document = await findDocument(db, actorUserId, 'deletePlayerDocument', parsed.data);
  if (!document.ok) return document;

  const { error } = await db.from('player_documents').delete().eq('id', documentId).eq('player_id', playerId);
  if (error) return failed('deletePlayerDocument', playerId, actorUserId, error);

  const { error: removeError } = await db.storage.from(BUCKET).remove([document.data.storagePath]);
  if (removeError) console.error(`[player-documents] orphaned ${document.data.storagePath}:`, removeError);
  return serviceOk({ documentId });
}

/** A link to the file that works for a minute. */
export async function playerDocumentUrl(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PlayerDocumentUrlResponse>> {
  const parsed = playerDocumentIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);

  const document = await findDocument(db, actorUserId, 'playerDocumentUrl', parsed.data);
  if (!document.ok) return document;

  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(document.data.storagePath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return failed('playerDocumentUrl', parsed.data.playerId, actorUserId, error);
  return serviceOk({ url: data.signedUrl });
}
