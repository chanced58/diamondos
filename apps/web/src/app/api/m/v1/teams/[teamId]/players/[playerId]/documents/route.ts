/**
 * GET: a player's documents and the types the team can upload. Responds
 * `PlayerDocumentsResponse` (`@baseball/shared`).
 *
 * POST: upload one, as multipart form data — `file` (a PDF or image, 20 MB at
 * most) with the `UploadPlayerDocumentInput` fields `documentType`, `title`
 * and optional `signedOn`, `expiresOn` and `notes`. Responds 201
 * `{ documentId }`; the player's previous document of the type is superseded.
 *
 * Roster managers only; same services as the web player documents page.
 */
import { PLAYER_DOCUMENT_MAX_BYTES } from '@baseball/shared';
import { apiError, requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadPlayerDocuments, uploadPlayerDocument } from '@/lib/services/roster/player-documents';

type Params = { params: { teamId: string; playerId: string } };

/** Room for the form's other fields and multipart boundaries on top of the file. */
const MAX_BODY_BYTES = PLAYER_DOCUMENT_MAX_BYTES + 1024 * 1024;

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadPlayerDocuments(auth.db, auth.user.id, { teamId: params.teamId, playerId: params.playerId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return apiError(400, 'That file is too large (20 MB max).', 'invalid');
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(400, 'Send the document as multipart form data.', 'invalid');
  }
  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === 'string' ? value : undefined;
  };
  const file = form.get('file');

  return serviceResponse(
    await uploadPlayerDocument(
      auth.db,
      auth.user.id,
      {
        teamId: params.teamId,
        playerId: params.playerId,
        documentType: text('documentType'),
        title: text('title'),
        signedOn: text('signedOn'),
        expiresOn: text('expiresOn'),
        notes: text('notes'),
      },
      file instanceof Blob
        ? { size: file.size, contentType: file.type, read: async () => new Uint8Array(await file.arrayBuffer()) }
        : null,
    ),
    201,
  );
}
