/**
 * Export one game's stats as a ZIP bundle of CSVs importable into the
 * Home Team (GameChanger) platform. Coach/platform-admin only.
 *
 * Files in the bundle:
 *   - player-stats.csv  (batting + pitching + fielding, one row per player)
 *   - team-stats.csv     (one row: W/L/T + runs for/against)
 *
 * Cookie-session route behind the web stats page's download link; the mobile
 * app uses `/api/m/v1/games/:gameId/export`. Both build the bundle with
 * `buildGameExport`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { serviceResponse } from '@/lib/api/service-response';
import { zipResponse } from '@/lib/api/zip-response';
import { buildGameExport } from '@/lib/services/games/build-game-export';

export async function GET(
  _req: NextRequest,
  { params }: { params: { gameId: string } },
) {
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await buildGameExport(db, user.id, { gameId: params.gameId });
  return result.ok ? zipResponse(result.data) : serviceResponse(result);
}
