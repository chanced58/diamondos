'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';

export async function updateMyProfileAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const firstName = (formData.get('firstName') as string)?.trim();
  const lastName = (formData.get('lastName') as string)?.trim();
  const phone = (formData.get('phone') as string)?.trim() || null;

  if (!firstName || !lastName) return 'First and last name are required.';

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await db
    .from('user_profiles')
    .update({ first_name: firstName, last_name: lastName, phone, email: user.email })
    .eq('id', user.id);

  if (error) return `Failed to update profile: ${error.message}`;

  revalidatePath('/');
  return 'saved';
}
