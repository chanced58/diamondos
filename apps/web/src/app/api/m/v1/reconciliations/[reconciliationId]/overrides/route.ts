/**
 * Accept the away scorekeeper's value for one reconciliation conflict (or
 * revert to home), from the mobile app. Body: `{ conflictKey, useAwayValue }`.
 * Responds `{ homeGameId }`. Same service as the web
 * `resolveReconciliationConflictAction`.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { resolveReconciliationConflict } from '@/lib/services/games/resolve-reconciliation-conflict';

export async function POST(req: Request, { params }: { params: { reconciliationId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const body = (await readJsonBody(req)) as { conflictKey?: unknown; useAwayValue?: unknown } | undefined;
  return serviceResponse(
    await resolveReconciliationConflict(auth.db, auth.user.id, {
      reconciliationId: params.reconciliationId,
      conflictKey: body?.conflictKey,
      useAwayValue: body?.useAwayValue,
    }),
  );
}
