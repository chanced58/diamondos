'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { PracticeBlockType } from '@baseball/shared';

export async function planPracticeAction(
  _prevState: string | null | undefined,
  formData: FormData,
): Promise<string | null> {
  const authClient = createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return 'Not authenticated — please log in again.';

  const teamId = formData.get('teamId') as string;
  const date = formData.get('date') as string;
  const time = (formData.get('time') as string) || '09:00';
  const location = (formData.get('location') as string) || null;
  const durationRaw = formData.get('duration') as string;
  const duration = durationRaw ? parseInt(durationRaw, 10) : null;
  const plan = ((formData.get('plan') as string) || '').trim();
  const drillIdsRaw = (formData.get('drill_ids') as string) || '[]';

  // Structured address fields from AddressAutocomplete
  const address = (formData.get('location_address') as string) || null;
  const latRaw = formData.get('location_latitude') as string;
  const lngRaw = formData.get('location_longitude') as string;
  const placeId = (formData.get('location_place_id') as string) || null;
  const latitude = latRaw ? parseFloat(latRaw) : null;
  const longitude = lngRaw ? parseFloat(lngRaw) : null;

  if (!teamId) return 'Missing team ID.';
  if (!date) return 'Practice date is required.';

  let drillIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(drillIdsRaw);
    if (Array.isArray(parsed)) {
      drillIds = parsed.filter((v): v is string => typeof v === 'string');
    }
  } catch {
    drillIds = [];
  }

  const scheduledAt = new Date(`${date}T${time}`).toISOString();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Verify coach role
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', teamId)
    .eq('user_id', user.id)
    .single();

  const isCoach =
    membership?.role === 'head_coach' ||
    membership?.role === 'assistant_coach' ||
    membership?.role === 'athletic_director';

  if (!isCoach) return 'Only coaches can plan practices.';

  // Create the practice
  const { data: practice, error } = await supabase
    .from('practices')
    .insert({
      team_id: teamId,
      scheduled_at: scheduledAt,
      duration_minutes: duration,
      location,
      address,
      latitude,
      longitude,
      place_id: placeId,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return `Failed to create practice: ${error.message}`;

  // Save the plan as coach_notes if provided
  if (plan) {
    await supabase.from('practice_notes').upsert(
      {
        practice_id: practice.id,
        team_id: teamId,
        coach_notes: plan,
        created_by: user.id,
      },
      { onConflict: 'practice_id' },
    );
  }

  // Create structured practice_blocks from selected drills. Block insert
  // failures don't fail the flow — the practice is created and the coach can
  // re-add drills in the full plan editor.
  if (drillIds.length > 0) {
    const { data: drillRows } = await supabase
      .from('practice_drills')
      .select('id, name, default_duration_minutes')
      .in('id', drillIds)
      .or(`team_id.eq.${teamId},visibility.eq.system`);
    const drillsById = new Map(
      ((drillRows ?? []) as Array<{
        id: string;
        name: string;
        default_duration_minutes: number | null;
      }>).map((d) => [d.id, d]),
    );
    const blockRows = drillIds
      .map((id, position) => {
        const drill = drillsById.get(id);
        if (!drill) return null;
        return {
          practice_id: practice.id,
          position,
          block_type: PracticeBlockType.CUSTOM,
          title: drill.name,
          planned_duration_minutes: drill.default_duration_minutes ?? 10,
          drill_id: drill.id,
          field_spaces: [],
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (blockRows.length > 0) {
      await supabase.from('practice_blocks').insert(blockRows);
    }
  }

  redirect(`/practices/${practice.id}`);
}
