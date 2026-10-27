/**
 * GET: a player's documents and the types the team can upload. Responds
 * `PlayerDocumentsResponse` (`@baseball/shared`).
 *
 * POST: upload one, as multipart form data — `file` (a PDF or image, 20 MB at
 * most) with the `UploadPlayerDocumentInput` fields `documentType`, `title`
 * and optional `signedOn`, `expiresOn` and `notes`. Responds 201
 * `{ documentId }`; the player's previous document of the type is superseded.
 * The actor is authorized, and a `Content-Length` within the limit required,
 * before the body is read.
 *
 * Roster managers only; same services as the web player documents page.
 */
import { PLAYER_DOCUMENT_MAX_BYTES } from '@baseball/shared';
import { apiError, requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import {
  authorizePlayerDocumentUpload,
  loadPlayerDocuments,
  uploadPlayerDocument,
} from '@/lib/services/roster/player-documents';

type Params = { params: { teamId: string; playerId: string } };

/** Room for the form's other fields and multipart boundaries on top of the file. */
const MAX_BODY_BYTES = PLAYER_DOCUMENT_MAX_BYTES + 1024 * 1024;
const TOO_LARGE = 'That file is too large (20 MB max).';

class BodyTooLargeError extends Error {}

/**
 * Parses the multipart body, counting the bytes actually read, so a body
 * longer than it declared is cut off at the limit instead of buffered whole.
 */
async function readBoundedForm(req: Request, maxBytes: number): Promise<FormData> {
  if (!req.body) throw new TypeError('Missing body');
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(body, { headers: { 'content-type': req.headers.get('content-type') ?? '' } }).formData();
}

export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadPlayerDocuments(auth.db, auth.user.id, { teamId: params.teamId, playerId: params.playerId }));
}

export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  // Authorize, and require a declared size within the limit, before the body is buffered.
  const allowed = await authorizePlayerDocumentUpload(auth.db, auth.user.id, { teamId: params.teamId, playerId: params.playerId });
  if (!allowed.ok) return serviceResponse(allowed);
  const contentLength = Number(req.headers.get('content-length'));
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return apiError(400, 'Send the document as multipart form data.', 'invalid');
  }
  if (contentLength > MAX_BODY_BYTES) return apiError(400, TOO_LARGE, 'invalid');
  let form: FormData;
  try {
    form = await readBoundedForm(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return apiError(400, TOO_LARGE, 'invalid');
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
        ? { size: file.size, read: async () => new Uint8Array(await file.arrayBuffer()) }
        : null,
    ),
    201,
  );
}
