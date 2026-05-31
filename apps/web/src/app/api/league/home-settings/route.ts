import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { leagueHomeThemeSchema, leagueLeaderConfigSchema } from '@baseball/shared';
import { z } from 'zod';

const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase kebab-case only')
  .min(3)
  .max(60);

const bodySchema = z.object({
  leagueId: z.string().uuid(),
  visibility: z.enum(['public', 'signed_in']),
  slug: slugSchema,
  homeTheme: leagueHomeThemeSchema,
  leaderConfig: leagueLeaderConfigSchema,
});

/**
 * POST /api/league/home-settings — persists league home-page settings.
 * Only league_admin may write; RLS allows any league_staff to UPDATE the
 * leagues row (no column-level RLS), so the admin check is enforced here.
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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.issues }, { status: 400 });
  }
  const { leagueId, visibility, slug, homeTheme, leaderConfig } = parsed.data;

  const { data: staffRow, error: staffErr } = await db
    .from('league_staff')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .eq('role', 'league_admin')
    .maybeSingle();
  if (staffErr) {
    console.error(`[home-settings] league_staff lookup failed league=${leagueId}: ${staffErr.message}`);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
  if (!staffRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // slug uniqueness (excluding this league)
  const { data: clash } = await db
    .from('leagues')
    .select('id')
    .eq('slug', slug)
    .neq('id', leagueId)
    .maybeSingle();
  if (clash) return NextResponse.json({ error: 'That URL slug is already taken' }, { status: 409 });

  const { data: updated, error: updErr } = await db
    .from('leagues')
    .update({ visibility, slug, home_theme: homeTheme, leader_config: leaderConfig })
    .eq('id', leagueId)
    .select('id');
  if (updErr) {
    console.error(`[home-settings] update failed league=${leagueId}: ${updErr.message}`);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
