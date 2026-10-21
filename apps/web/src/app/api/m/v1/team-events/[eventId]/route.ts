/**
 * Delete a team event from the mobile app. Responds `{ eventId }`. Same
 * service as the web `deleteEventAction`. (The app reads events directly
 * through Supabase: team members may read their team's events under RLS.)
 */
import { requireApiUser } from '@/lib/api/bearer-auth';
import { serviceResponse } from '@/lib/api/service-response';
import { deleteTeamEvent } from '@/lib/services/team-events/delete-team-event';

export async function DELETE(req: Request, { params }: { params: { eventId: string } }) {
  const auth = await requireApiUser(req);
  if (auth.response) return auth.response;

  return serviceResponse(await deleteTeamEvent(auth.db, auth.user.id, { eventId: params.eventId }));
}
