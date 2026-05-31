import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recomputeLeagueSnapshot } from '@/lib/league-snapshot/recompute';
import { listLeagueSeasons } from '@/lib/league-snapshot/season';

export const dynamic = 'force-dynamic';

/**
 * Scheduled safety-net rebuild of all league snapshots. Vercel Cron calls this
 * with `Authorization: Bearer <CRON_SECRET>`. Self-heals any snapshot missed by
 * the on-finalize trigger.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: leagues, error } = await db.from('leagues').select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rebuilt = 0;
  for (const lg of leagues ?? []) {
    const { data: members } = await db
      .from('league_members')
      .select('team_id')
      .eq('league_id', lg.id)
      .eq('is_active', true);
    const teamIds = (members ?? [])
      .map((m: { team_id: string | null }) => m.team_id)
      .filter((t: string | null): t is string => Boolean(t));
    const seasons = await listLeagueSeasons(db, teamIds);
    for (const season of seasons) {
      try {
        await recomputeLeagueSnapshot(db, lg.id, season);
        rebuilt++;
      } catch (err) {
        console.error(
          `[cron] rebuild failed league=${lg.id} season=${season}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return NextResponse.json({ ok: true, rebuilt });
}
