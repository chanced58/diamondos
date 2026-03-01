'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export async function deleteEventAction(_prevState: string | null, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated.';

  const eventId = formData.get('eventId') as string;
  if (!eventId) return 'Missing event ID.';

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: event } = await supabase
    .from('team_events')
    .select('team_id')
    .eq('id', eventId)
    .single();

  if (!event) return 'Event not found.';

  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', event.team_id)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can delete events.';

  const { error } = await supabase
    .from('team_events')
    .delete()
    .eq('id', eventId);

  if (error) return `Failed to delete event: ${error.message}`;

  redirect('/games');
}
