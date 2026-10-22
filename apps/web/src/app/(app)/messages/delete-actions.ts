'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { deleteChannel, deleteMessage } from '@/lib/services/messaging/team-messaging';

/**
 * Delete actions — thin wrappers over `lib/services/messaging`, which the
 * mobile `/api/m/v1` routes share. Each returns null, or the message to show.
 */

function serviceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function currentUserId(): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  return user?.id ?? null;
}

/** Coaches delete announcement and topic channels; CASCADE removes members and messages. */
export async function deleteChannelAction(channelId: string): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return 'Not authenticated.';

  const result = await deleteChannel(serviceClient(), userId, { channelId });
  if (!result.ok) return result.error;

  revalidatePath('/messages', 'layout');
  return null;
}

/** Soft delete: coaches can delete any message; everyone can delete their own. */
export async function deleteMessageAction(messageId: string): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return 'Not authenticated.';

  const result = await deleteMessage(serviceClient(), userId, { messageId });
  if (!result.ok) return result.error;

  revalidatePath('/messages', 'layout');
  return null;
}
