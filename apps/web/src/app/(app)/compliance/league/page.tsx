import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueTeamIds } from '@baseball/database';
import { derivePitchingStats, deriveBattingStats } from '@baseball/shared';
import type { PitchingStats, BattingStats, StatTier } from '@baseball/shared';
import { PitchingStatsTable } from '../PitchingStatsTable';
import { BattingStatsTable } from '../BattingStatsTable';
import { TierToggle } from '../TierToggle';

export const metadata: Metadata = { title: 'League Stats' };

const RELEVANT_EVENT_TYPES = [
  'pitch_thrown', 'hit', 'out', 'strikeout', 'walk', 'hit_by_pitch', 'score',
  'pitching_change', 'inning_change', 'game_start', 'double_play', 'sacrifice_bunt',
  'sacrifice_fly', 'field_error', 'stolen_base', 'caught_stealing',
] as const;

export default async function LeagueStatsPage({
  searchParams,
}: {
  searchParams: { tab?: string; tier?: string };
}): Promise<JSX.Element | null> {
  const VALID_TABS = ['pitching', 'hitting'] as const;
  const tab = VALID_TABS.includes(searchParams.tab as typeof VALID_TABS[number])
    ? (searchParams.tab as typeof VALID_TABS[number])
    : 'hitting';

  const VALID_TIERS: StatTier[] = ['youth', 'high_school', 'college'];
  const tier: StatTier = VALID_TIERS.includes(searchParams.tier as StatTier)
    ? (searchParams.tier as StatTier)
    : 'high_school';

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const league = await getActiveLeague(activeTeam.id);
  if (!league) redirect('/compliance');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get all teams in the league
  const teamIds = await getLeagueTeamIds(db, league.id);

  // Get all completed/in-progress games across all league teams
  const { data: gamesData } = await db
    .from('games')
    .select('id, team_id')
    .in('team_id', teamIds)
    .in('status', ['completed', 'in_progress']);

  const gameIds = (gamesData ?? []).map((g) => g.id);

  // Get all relevant events — fetch in batches to avoid OOM/timeout for large leagues
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawEvents: any[] = [];
  const BATCH_SIZE = 200;
  for (let i = 0; i < gameIds.length; i += BATCH_SIZE) {
    const batchGameIds = gameIds.slice(i, i + BATCH_SIZE);
    const { data: events, error: eventsError } = await db
      .from('game_events')
      .select('*')
      .in('game_id', batchGameIds)
      .in('event_type', RELEVANT_EVENT_TYPES as unknown as string[])
      .order('game_id')
      .order('sequence_number');
    if (eventsError) throw eventsError;
    for (const e of events ?? []) rawEvents.push(e);
  }

  // Get all players across all league teams
  const { data: allPlayers } = await db
    .from('players')
    .select('id, team_id, first_name, last_name')
    .in('team_id', teamIds);

  // Get team names for display
  const { data: teamsData } = await db
    .from('teams')
    .select('id, name')
    .in('id', teamIds);
  const teamNameMap = new Map((teamsData ?? []).map((t) => [t.id, t.name]));

  // Build player list with team name included in the display name
  const playerList = (allPlayers ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: `${p.last_name} (${teamNameMap.get(p.team_id) ?? 'Unknown'})`,
  }));

  const allPlayerIds = new Set(playerList.map((p) => p.id));

  // Compute stats
  const pitchingStatsMap = derivePitchingStats(rawEvents, playerList);
  const allPitchingStats: PitchingStats[] = Array.from(pitchingStatsMap.values())
    .filter((s) => allPlayerIds.has(s.playerId))
    .sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  const battingStatsMap = deriveBattingStats(rawEvents, playerList);
  const allBattingStats: BattingStats[] = Array.from(battingStatsMap.values())
    .filter((s) => allPlayerIds.has(s.playerId))
    .sort((a, b) => b.plateAppearances - a.plateAppearances);

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{league.name} Stats</h1>
          <Link
            href="/compliance"
            className="text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Team Stats
          </Link>
          <Link
            href={`/compliance/league/teams?tier=${tier}`}
            className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Team Comparison
          </Link>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-gray-500 text-sm">
            {teamIds.length} {teamIds.length === 1 ? 'team' : 'teams'} · {gameIds.length} {gameIds.length === 1 ? 'game' : 'games'}
          </p>
          <TierToggle currentTier={tier} baseUrl="/compliance/league" />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <Link
          href={`/compliance/league?tab=pitching&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'pitching'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Pitching
        </Link>
        <Link
          href={`/compliance/league?tab=hitting&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'hitting'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Hitting
        </Link>
      </div>

      {tab === 'pitching' && (
        allPitchingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">No pitching data across league teams yet.</p>
          </div>
        ) : (
          <PitchingStatsTable
            stats={allPitchingStats}
            // Empty complianceMap is intentional — compliance rules are team-specific
            // and cannot be meaningfully aggregated across teams with different tiers/rules
            complianceMap={{}}
            today={new Date().toISOString().slice(0, 10)}
            tier={tier}
          />
        )
      )}

      {tab === 'hitting' && (
        allBattingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">No hitting data across league teams yet.</p>
          </div>
        ) : (
          <BattingStatsTable stats={allBattingStats} tier={tier} />
        )
      )}
    </div>
  );
}
