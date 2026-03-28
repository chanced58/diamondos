import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { derivePitchingStats, deriveBattingStats, computeOpponentBatting, weAreHome } from '@baseball/shared';
import type { PitchingStats, BattingStats, StatTier, OppBattingRow } from '@baseball/shared';
import { PitchingStatsTable } from './PitchingStatsTable';
import { BattingStatsTable } from './BattingStatsTable';
import { OpponentsStatsTable } from './OpponentsStatsTable';
import type { OpponentTeamStats } from './OpponentsStatsTable';
import { SeasonPicker } from './SeasonPicker';
import { TierToggle } from './TierToggle';

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
  'stolen_base',
  'caught_stealing',
] as const;

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: { tab?: string; season?: string; tier?: string };
}): Promise<JSX.Element | null> {
  const VALID_TABS = ['pitching', 'hitting', 'opponents'] as const;
  const tab = VALID_TABS.includes(searchParams.tab as typeof VALID_TABS[number])
    ? (searchParams.tab as typeof VALID_TABS[number])
    : 'pitching';

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get team level for tier-aware stat display
  const { data: teamData } = await db
    .from('teams')
    .select('*')
    .eq('id', activeTeam.id)
    .single();
  const teamLevel = teamData?.level ?? 'high_school';
  const VALID_TIERS: StatTier[] = ['youth', 'high_school', 'college'];
  const defaultTier: StatTier =
    teamLevel === 'youth' || teamLevel === 'middle_school' ? 'youth'
    : teamLevel === 'college' || teamLevel === 'pro' ? 'college'
    : 'high_school';
  const tier: StatTier = VALID_TIERS.includes(searchParams.tier as StatTier)
    ? (searchParams.tier as StatTier)
    : defaultTier;

  // Fetch all seasons for the picker
  const { data: allSeasons } = await db
    .from('seasons')
    .select('id, name, is_active')
    .eq('team_id', activeTeam.id)
    .order('start_date', { ascending: false });

  // Determine which season to display:
  // 1. Explicit season param from URL
  // 2. Active season (default)
  // 3. No season → show all games
  let season: { id: string; name: string } | null = null;
  if (searchParams.season) {
    const match = (allSeasons ?? []).find((s) => s.id === searchParams.season);
    if (match) season = { id: match.id, name: match.name };
    // If param is invalid, fall through to "all games"
  } else {
    const active = (allSeasons ?? []).find((s) => s.is_active);
    if (active) season = { id: active.id, name: active.name };
  }

  // Get games — from the selected season if one exists, otherwise all completed/in-progress games
  let gamesQuery = db
    .from('games')
    .select('id, opponent_team_id, opponent_name, home_score, away_score, location_type, neutral_home_team')
    .eq('team_id', activeTeam.id)
    .in('status', ['completed', 'in_progress']);

  if (season) {
    gamesQuery = gamesQuery.eq('season_id', season.id);
  }

  const { data: gamesData } = await gamesQuery;
  const gameIds = (gamesData ?? []).map((g) => g.id);

  // Get all relevant events for those games
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase select('*') returns untyped rows
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

  // Fetch ALL players (not just active) so deactivated players who
  // participated in past games still resolve their names in stats.
  const { data: players } = await db
    .from('players')
    .select('id, first_name, last_name')
    .eq('team_id', activeTeam.id);

  const playerList = (players ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
  }));

  // Only show stats for players on our team roster (filters out opponent
  // player IDs that leak through derivePitchingStats' fallback coalesce
  // of pitcherId ?? opponentPitcherId, and any misattributed batting IDs).
  const teamPlayerIds = new Set(playerList.map((p) => p.id));

  // Compute pitching stats
  const pitchingStatsMap = derivePitchingStats(rawEvents, playerList);
  const allPitchingStats: PitchingStats[] = Array.from(pitchingStatsMap.values())
    .filter((s) => teamPlayerIds.has(s.playerId))
    .sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  // Compute batting stats
  const battingStatsMap = deriveBattingStats(rawEvents, playerList);
  const allBattingStats: BattingStats[] = Array.from(battingStatsMap.values())
    .filter((s) => teamPlayerIds.has(s.playerId))
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

  // ── Opponents tab data ──────────────────────────────────────────────────────
  let opponentTeamStats: OpponentTeamStats[] = [];

  if (tab === 'opponents') {
    // Collect unique opponent_team_ids from games
    const oppTeamIds = [...new Set(
      (gamesData ?? [])
        .map((g) => g.opponent_team_id as string | null)
        .filter((id): id is string => id != null),
    )];

    if (oppTeamIds.length > 0) {
      const [oppTeamsResult, oppPlayersResult] = await Promise.all([
        db
          .from('opponent_teams')
          .select('id, name, abbreviation')
          .in('id', oppTeamIds),
        db
          .from('opponent_players')
          .select('id, opponent_team_id, first_name, last_name')
          .in('opponent_team_id', oppTeamIds),
      ]);

      const oppTeams = oppTeamsResult.data ?? [];
      const oppPlayers = oppPlayersResult.data ?? [];

      // Build name map for all opponent players
      const oppPlayerNameMap = new Map<string, string>(
        oppPlayers.map((p) => [p.id, `${p.first_name} ${p.last_name}`]),
      );

      // Map opponent player ID → opponent team ID
      const playerToTeam = new Map<string, string>(
        oppPlayers.map((p) => [p.id, p.opponent_team_id]),
      );

      // Compute opponent batting across all games
      const oppBattingRows = computeOpponentBatting(rawEvents, oppPlayerNameMap);

      // Compute opponent pitching across all games
      const oppPlayerList = oppPlayers.map((p) => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
      }));
      const oppPitchingMap = derivePitchingStats(rawEvents, oppPlayerList);
      const oppPlayerIds = new Set(oppPlayers.map((p) => p.id));
      const oppPitchingRows: PitchingStats[] = Array.from(oppPitchingMap.values())
        .filter((s) => oppPlayerIds.has(s.playerId) && s.totalPitches > 0);

      // Build W-L record per opponent team
      const recordMap = new Map<string, { wins: number; losses: number; ties: number; gamesPlayed: number }>();
      for (const game of gamesData ?? []) {
        const oppId = game.opponent_team_id as string | null;
        if (!oppId) continue;
        if (!recordMap.has(oppId)) recordMap.set(oppId, { wins: 0, losses: 0, ties: 0, gamesPlayed: 0 });
        const rec = recordMap.get(oppId)!;
        rec.gamesPlayed++;

        const homeScore = (game.home_score as number | null) ?? 0;
        const awayScore = (game.away_score as number | null) ?? 0;
        if (homeScore === 0 && awayScore === 0) continue; // no score recorded yet

        const isHome = weAreHome(
          game.location_type as string,
          game.neutral_home_team as string | null,
        );
        const ourScore = isHome ? homeScore : awayScore;
        const theirScore = isHome ? awayScore : homeScore;

        if (ourScore > theirScore) rec.wins++;
        else if (theirScore > ourScore) rec.losses++;
        else rec.ties++;
      }

      // Assemble per-team stats
      opponentTeamStats = oppTeams.map((team) => {
        const record = recordMap.get(team.id) ?? { wins: 0, losses: 0, ties: 0, gamesPlayed: 0 };
        return {
          teamId: team.id,
          teamName: team.name,
          gamesPlayed: record.gamesPlayed,
          wins: record.wins,
          losses: record.losses,
          ties: record.ties,
          batting: oppBattingRows.filter((r) => playerToTeam.get(r.playerId) === team.id),
          pitching: oppPitchingRows.filter((r) => playerToTeam.get(r.playerId) === team.id),
        };
      }).filter((t) => t.gamesPlayed > 0);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Stats</h1>
          <SeasonPicker
            seasons={(allSeasons ?? []).map((s) => ({ id: s.id, name: s.name }))}
            currentSeasonId={season?.id ?? null}
          />
        </div>
        <div className="flex items-center gap-3 mt-2">
          <p className="text-gray-500 text-sm">
            {season
              ? `Season: ${season.name} · ${gameIds.length} ${gameIds.length === 1 ? 'game' : 'games'}`
              : `All games · ${gameIds.length} ${gameIds.length === 1 ? 'game' : 'games'} scored`}
          </p>
          <TierToggle currentTier={tier} />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <Link
          href={`/compliance?tab=pitching${season ? `&season=${season.id}` : ''}&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'pitching'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Pitching
        </Link>
        <Link
          href={`/compliance?tab=hitting${season ? `&season=${season.id}` : ''}&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'hitting'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Hitting
        </Link>
        <Link
          href={`/compliance?tab=opponents${season ? `&season=${season.id}` : ''}&tier=${tier}`}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === 'opponents'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Opponents
        </Link>
      </div>

      {/* Pitching tab */}
      {tab === 'pitching' && (
        allPitchingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">
              {season ? `No pitching data for ${season.name} yet.` : 'No pitching data yet.'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Stats will appear once games have been scored.
            </p>
          </div>
        ) : (
          <PitchingStatsTable
            stats={allPitchingStats}
            complianceMap={complianceMap}
            today={today}
            tier={tier}
          />
        )
      )}

      {/* Hitting tab */}
      {tab === 'hitting' && (
        allBattingStats.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
            <p className="text-gray-500 text-sm">
              {season ? `No hitting data for ${season.name} yet.` : 'No hitting data yet.'}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Stats will appear once games have been scored.
            </p>
          </div>
        ) : (
          <BattingStatsTable stats={allBattingStats} tier={tier} />
        )
      )}

      {/* Opponents tab */}
      {tab === 'opponents' && (
        <OpponentsStatsTable teams={opponentTeamStats} />
      )}
    </div>
  );
}
