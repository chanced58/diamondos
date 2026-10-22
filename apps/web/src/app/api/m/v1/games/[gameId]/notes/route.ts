/**
 * GET: a game's notes as the viewer may see them. Responds `GameNotesResponse`
 * (`@baseball/shared`).
 *
 * PUT: a coach saves overall notes, coach-only notes and per-player
 * assessments. Body: `SaveGameNotesInput` without `gameId` (taken from the
 * path); omitted parts are left unchanged. Responds `{ gameId }`. Same service
 * as the web `saveGameNotesAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { loadGameNotes } from '@/lib/services/games/load-game-notes';
import { saveGameNotes } from '@/lib/services/games/save-game-notes';

export async function GET(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await loadGameNotes(auth.db, auth.user.id, { gameId: params.gameId }));
}

export async function PUT(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await saveGameNotes(auth.db, auth.user.id, { ...fields, gameId: params.gameId }));
}
