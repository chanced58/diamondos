import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getTeamsForUser } from '@baseball/database';
import { derivePitchingStats, deriveBattingStats } from '@baseball/shared';
import type { PitchingStats, BattingStats } from '@baseball/shared';
import { PitchingStatsTable } from './PitchingStatsTable';
import { BattingStatsTable } from './BattingStatsTable';

export const metadata: Metadata = { title: 'Stats' };

const RELEVANT_EVENT_TYPES = [
  'pitch_thrown',
  'hit',
  'out',
  'strikeout',
  'walk',
  'hit_by_pitch',
  'score',
  'pitching_change',
  'inning_change',
  'game_start',
  'double_play',
  'sacrifice_bunt',
  'sacrifice_fly',
  'field_error',
] as const;

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: { tab?: string };
}): Promise<JSX.Element | null> {
  const tab = searchParams.tab === 'hitting' ? 'hitting' : 'pitching';

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const teams = await getTeamsForUser(auth, user.id);
  const activeTeam = teams?.[0]?.teams as { id: string; name: string } | undefined;
  if (!activeTeam) redirect('/dashboard');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get current season
  const { data: season } = await db
    .from('seasons')
    .select('id, name')
    .eq('team_id', activeTeam.id)
    .eq('is_current', true)
    .maybeSingle();

  // Get all games for this season
  const gameIds: string[] = [];
  if (season) {
    const { data: games } = await db
      .from('games')
      .select('id')
      .eq('team_id', activeTeam.id)
      .eq('season_id', season.id);
    for (const g of games ?? []) gameIds.push(g.id);
  }

  // Get all relevant events for those games
  const rawEvents: any[] = [];
  if (gameIds.length > 0) {
    const { data: events } = await db
      .from('game_events')
      .select('*')
      .in('game_id', gameIds)
      .in('event_type', RELEVANT_EVENT_TYPES as unknown as string[])
      .order('game_id')
      .order('sequence_number');
    for (const e of events ?? []) rawEvents.push(e);
  }

  // Get all players on the team for name lookup
  const { data: players } = await db
    .from('players')
    .select('id, first_name, last_name')
    .eq('team_id', activeTeam.id)
    .eq('is_active', true);

  const playerList = (players ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
  }));

  // Compute pitching stats
  const pitchingStatsMap = derivePitchingStats(rawEvents, playerList);
  const allPitchingStats: PitchingStats[] = Array.from(pitchingStatsMap.values())
    .sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  // Compute batting stats
  const battingStatsMap = deriveBattingStats(rawEvents, playerList);
  const allBattingStats: BattingStats[] = Array.from(battingStatsMap.values())
    .sort((a, b) => b.plateAppearances - a.plateAppearances);

  // Get compliance data (pitch counts, rest days) for today
  const today = new Date().toISOString().slice(0, 10);
  const { data: pitchCounts } = await db
    .from('pitch_counts')
    .select('player_id, pitch_count, required_rest_days, can_pitch_next_day, game_date')
    .in('player_id', allPitchingStats.map((s) => s.playerId))
    .order('game_date', { ascending: false });

  // Most recent pitch_count record per player
  const complianceMap: Record<string, {
    pitchCount: number;
    requiredRestDays: number | null;
    canPitchNextDay: boolean | null;
    lastGameDate: string | null;
  }> = {};

  for (const row of pitchCounts ?? []) {
    if (!complianceMap[row.player_id]) {
      complianceMap[row.player_id] = {
        pitchCount: row.pitch_count,
        requiredRestDays: row.required_rest_days,
        canPitchNextDay: row.can_pitch_next_day,
        lastGameDate: row.game_date,
      };
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Stats</h1>
        <p className="text-gray-500 text-sm mt-1">
          {season ? `Season stats — ${season.name}` : 'No active season found.'}
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <Link
          href="/compliance?tab=pitching"
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'pitching'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Pitching
        </Link>
        <Link
          href="/compliance?tab=hitting"
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'hitting'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Hitting
        </Link>
      </div>

      {/* Pitching tab */}
      {tab === 'pitching' && (
        allPitchingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">No pitching data for this season yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Stats will appear once games have been scored.
            </p>
          </div>
        ) : (
          <PitchingStatsTable
            stats={allPitchingStats}
            complianceMap={complianceMap}
            today={today}
          />
        )
      )}

      {/* Hitting tab */}
      {tab === 'hitting' && (
        allBattingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">No hitting data for this season yet.</p>
            <p className="text-gray-400 text-xs mt-1">
              Stats will appear once games have been scored.
            </p>
          </div>
        ) : (
          <BattingStatsTable stats={allBattingStats} />
        )
      )}
    </div>
  );
}
