/**
 * DELETE: remove a division; its teams stay in the league with no division.
 * Responds `{ divisionId }`. League staff; same service as the web
 * /league/admin page.
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { removeLeagueDivision } from '@/lib/services/league-admin/league-teams';

type Params = { params: { leagueId: string; divisionId: string } };

export async function DELETE(req: Request, { params }: Params) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await removeLeagueDivision(auth.db, auth.user.id, { leagueId: params.leagueId, divisionId: params.divisionId }));
}
