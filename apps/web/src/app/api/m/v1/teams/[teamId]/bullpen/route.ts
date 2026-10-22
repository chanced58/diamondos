/**
 * The Bullpen Planner for coaches: each pitching candidate's availability on
 * `?date=YYYY-MM-DD`, or without it on the next game's day (else the device's
 * `?today=`). Responds `BullpenResponse` (`@baseball/shared`).
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadBullpenPlan } from '@/lib/services/stats/load-bullpen-plan';

export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const search = new URL(req.url).searchParams;
  return serviceResponse(
    await loadBullpenPlan(auth.db, auth.user.id, {
      teamId: params.teamId,
      date: search.get('date') || undefined,
      today: search.get('today') || undefined,
    }),
  );
}
