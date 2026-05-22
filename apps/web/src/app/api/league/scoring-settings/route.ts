import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { leagueScoringSettingsSchema } from '@baseball/shared';

/**
 * POST /api/league/scoring-settings — persists per-league scoring feature flags.
 *
 * Only league_admin users may write this column. RLS permits any league_staff
 * to UPDATE the leagues row (PostgreSQL has no column-level RLS), so the admin
 * check is enforced here at the application layer.
 */
export async function POST(request: NextRequest) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { leagueId, settings } =
    (body as { leagueId?: unknown; settings?: unknown }) ?? {};
  if (typeof leagueId !== 'string' || leagueId.length === 0) {
    return NextResponse.json({ error: 'leagueId is required' }, { status: 400 });
  }

  const { data: staffRow, error: staffErr } = await db
    .from('league_staff')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('role', 'league_admin')
    .maybeSingle();

  if (staffErr) {
    console.error(
      `[scoring-settings] league_staff lookup failed league=${leagueId} user=${user.id}: ${staffErr.message}`,
    );
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }

  if (!staffRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = leagueScoringSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid settings shape', details: parsed.error.issues },
      { status: 400 },
    );
  }

  // .select() with count gives us the number of rows touched. If zero, the
  // leagueId was either deleted or doesn't exist — surface that as a 404 so
  // the caller doesn't get a misleading success response.
  const { data: updatedRows, error: updateError } = await db
    .from('leagues')
    .update({ scoring_settings: parsed.data })
    .eq('id', leagueId)
    .select('id');

  if (updateError) {
    console.error(
      `[scoring-settings] update failed league=${leagueId}: ${updateError.message}`,
    );
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }

  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
