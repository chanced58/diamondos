/**
 * GET `[?view=league]`: the team dashboard — live games, the next game, the
 * next four weeks, recent results and announcements. Responds
 * `DashboardResponse` (`@baseball/shared`); the same service as the web
 * dashboard. 404 for a team the viewer isn't on.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { loadDashboard } from '@/lib/services/dashboard/load-dashboard';

/** See `loadDashboard`. */
export async function GET(req: Request, { params }: { params: { teamId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  const view = new URL(req.url).searchParams.get('view');
  return serviceResponse(await loadDashboard(auth.db, auth.user.id, { teamId: params.teamId, view }));
}
