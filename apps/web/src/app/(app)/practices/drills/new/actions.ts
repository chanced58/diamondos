'use server';

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/server';
import { createPracticeServiceClient } from '@/lib/practices/authz';
import { createTeamDrill } from '@/lib/services/practices/drills';
import { drillFormFields } from '../drill-form-fields';

/** Adds a team drill from the New drill form; a wrapper over the service `/api/m/v1` shares. */
export async function createDrillAction(
  _prev: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const result = await createTeamDrill(createPracticeServiceClient(), user.id, {
    teamId: formData.get('teamId'),
    drill: drillFormFields(formData),
  });
  if (!result.ok) return result.error;
  // redirect() throws a NEXT_REDIRECT sentinel by design — keep it outside
  // any try/catch.
  redirect(`/practices/drills/${result.data.drillId}`);
}
