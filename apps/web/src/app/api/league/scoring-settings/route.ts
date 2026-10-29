import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { readJsonBody, serviceResponse } from '@/lib/api/service-response';
import { saveLeagueScoringSettings } from '@/lib/services/league-admin/league-scoring-settings';

/**
 * POST /api/league/scoring-settings — persists per-league scoring feature
 * flags for the web league admin form. Body: `{ leagueId, settings }`.
 *
 * A thin wrapper over `saveLeagueScoringSettings`, shared with the mobile
 * `/api/m/v1/league-admin/:leagueId/scoring-settings` route: only league
 * admins save, which the service enforces because RLS lets any league staff
 * member update the leagues row (PostgreSQL has no column-level RLS).
 */
export async function POST(request: NextRequest) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (body === undefined) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  return serviceResponse(await saveLeagueScoringSettings(db, user.id, body));
}
