'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { createPlayerSchema } from '@baseball/shared';

export async function addPlayerAction(_prevState: string | null, formData: FormData) {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  if (!teamId) return 'Missing team ID.';

  const secondaryPositions = formData.getAll('secondaryPositions') as string[];
  const email = (formData.get('email') as string)?.toLowerCase().trim() || undefined;
  const phone = (formData.get('phone') as string)?.trim() || undefined;

  const raw = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    jerseyNumber: formData.get('jerseyNumber')
      ? Number(formData.get('jerseyNumber'))
      : undefined,
    primaryPosition: (formData.get('primaryPosition') as string) || undefined,
    bats: (formData.get('bats') as string) || undefined,
    throws: (formData.get('throws') as string) || undefined,
    graduationYear: formData.get('graduationYear')
      ? Number(formData.get('graduationYear'))
      : undefined,
    email: email || '',
    phone,
  };

  const parsed = createPlayerSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.errors[0].message;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: player, error } = await supabase
    .from('players')
    .insert({
      team_id: teamId,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      jersey_number: parsed.data.jerseyNumber ?? null,
      primary_position: parsed.data.primaryPosition ?? null,
      secondary_positions: secondaryPositions,
      bats: parsed.data.bats ?? null,
      throws: parsed.data.throws ?? null,
      graduation_year: parsed.data.graduationYear ?? null,
      email: email || null,
      phone: phone || null,
    })
    .select('id')
    .single();
  if (error) return `Failed to add player: ${error.message}`;

  // Send an invite email if an address was provided (failure is non-fatal)
  if (email && player) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
    await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        invited_as_player: player.id,
        invited_to_team: teamId,
        invited_role: 'player',
      },
      redirectTo: `${appUrl}/auth/callback?team=${teamId}&player=${player.id}&role=player`,
    });

    // Track the invitation so it appears in the Pending Invitations section
    await supabase.from('team_invitations').upsert(
      {
        team_id: teamId,
        email,
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        role: 'player',
        invited_by: user.id,
        status: 'pending',
      },
      { onConflict: 'team_id,email' },
    );
  }

  redirect(`/teams/${teamId}/roster`);
}
