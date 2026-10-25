'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { deleteTeamDrill, updateTeamDrill } from '@/lib/services/practices/drills';
import { drillFormFields } from '../../drill-form-fields';

/**
 * Saves the Edit drill form; a wrapper over the service `/api/m/v1` shares,
 * which refuses curated drills and drills of a team the user doesn't coach.
 */
export async function updateDrillAction(
  _prev: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const id = formData.get('id') as string | null;
  if (!id) return 'Missing drill id.';

  const result = await updateTeamDrill(createPracticeServiceClient(), user.id, {
    drillId: id,
    drill: drillFormFields(formData),
  });
  if (!result.ok) return result.error;
  // redirect() throws a NEXT_REDIRECT sentinel by design — keep it outside
  // any try/catch.
  redirect(`/practices/drills/${id}`);
}

/** Deletes a team drill, back to the library; on a refusal it stays on the drill. */
export async function deleteDrillAction(formData: FormData): Promise<void> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect('/sign-in');

  const id = formData.get('id') as string | null;
  if (!id) redirect('/practices/drills');

  const result = await deleteTeamDrill(createPracticeServiceClient(), user.id, { drillId: id });
  redirect(result.ok ? '/practices/drills' : `/practices/drills/${id}`);
}
