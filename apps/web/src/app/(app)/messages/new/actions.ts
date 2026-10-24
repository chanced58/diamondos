'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createTeamChannel } from '@/lib/services/messaging/team-messaging';

/** New channel form — a thin wrapper over `createTeamChannel`, shared with the mobile route. */
export async function createChannelAction(_prevState: string | null | undefined, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await createTeamChannel(db, user.id, {
    teamId: formData.get('teamId'),
    channelType: (formData.get('channelType') as string) || 'topic',
    name: (formData.get('name') as string | null) ?? '',
    description: (formData.get('description') as string | null) ?? null,
  });
  if (!result.ok) return result.error;

  revalidatePath('/messages', 'layout');
  redirect(`/messages/${result.data.channelId}`);
}
