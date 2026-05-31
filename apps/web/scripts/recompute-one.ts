/* One-off manual verification for recomputeLeagueSnapshot.
 * Usage: LEAGUE_ID=.. SEASON=.. npx tsx apps/web/scripts/recompute-one.ts
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 */
import { createClient } from '@supabase/supabase-js';
import { recomputeLeagueSnapshot } from '../src/lib/league-snapshot/recompute';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const leagueId = process.env.LEAGUE_ID!;
  const season = process.env.SEASON!;
  const db = createClient(url, key);
  await recomputeLeagueSnapshot(db as any, leagueId, season);
  const { count } = await db
    .from('league_player_stat_snapshot')
    .select('*', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .eq('season', season);
  console.log(`OK: player snapshot rows for ${leagueId}/${season} = ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
