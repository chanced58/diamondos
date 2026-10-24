'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { startDirectMessage } from '@/lib/services/messaging/team-messaging';

/** Opens (or creates) a DM — a thin wrapper over `startDirectMessage`, shared with the mobile route. */
export async function startDmAction(formData: FormData): Promise<void> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) redirect('/login');

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const result = await startDirectMessage(db, user.id, {
    teamId: formData.get('teamId'),
    targetUserId: formData.get('targetUserId'),
  });
  if (!result.ok) {
    console.warn(`[startDmAction] actor=${user.id} refused: ${result.code} ${result.error}`);
    return;
  }

  revalidatePath('/messages', 'layout');
  redirect(`/messages/${result.data.channelId}`);
}
