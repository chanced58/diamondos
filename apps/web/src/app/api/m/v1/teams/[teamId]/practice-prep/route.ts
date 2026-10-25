/**
 * GET `?duration=&sourceGameId=`: the suggested prep practice for the team's
 * next game. Responds `PrepPreviewResponse` (`@baseball/shared`), with
 * `nextGame: null` when there is no upcoming game.
 *
 * POST: saves the plan as a practice linked to the game. Body:
 * `CreatePrepPracticeInput` without `teamId`. Responds 201 `{ practiceId }`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { createPrepPracticeFromPlan, loadPrepPreview } from '@/lib/services/practices/prep-practice';

type Params = { params: { teamId: string } };

/** The suggested plan; see `loadPrepPreview`. */
export async function GET(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const search = new URL(req.url).searchParams;
  return serviceResponse(
    await loadPrepPreview(auth.db, auth.user.id, {
      teamId: params.teamId,
      durationMinutes: search.get('duration') ?? undefined,
      sourceGameId: search.get('sourceGameId') || null,
    }),
  );
}

/** Saves the plan; see `createPrepPracticeFromPlan`. */
export async function POST(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = await readJsonBody(req);
  const fields = body && typeof body === 'object' ? body : {};
  return serviceResponse(await createPrepPracticeFromPlan(auth.db, auth.user.id, { ...fields, teamId: params.teamId }), 201);
}
