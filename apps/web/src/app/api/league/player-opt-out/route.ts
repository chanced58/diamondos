import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

const bodySchema = z.object({
  leagueId: z.string().uuid(),
  playerId: z.string().uuid(),
  optOut: z.boolean(),
});

/**
 * POST /api/league/player-opt-out — toggle a player's public listing suppression.
 * league_admin only.
 */
export async function POST(request: NextRequest) {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const { leagueId, playerId, optOut } = parsed.data;

  const { data: staffRow, error: staffErr } = await db
    .from('league_staff')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('role', 'league_admin')
    .maybeSingle();
  if (staffErr) {
    console.error(`[player-opt-out] staff lookup failed league=${leagueId}: ${staffErr.message}`);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!staffRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: updatedRows, error } = await db
    .from('league_players')
    .update({ public_opt_out: optOut })
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .select('player_id');
  if (error) {
    console.error(`[player-opt-out] update failed league=${leagueId} player=${playerId}: ${error.message}`);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
  if (!updatedRows || updatedRows.length === 0) {
    return NextResponse.json({ error: 'Player not found in this league' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
