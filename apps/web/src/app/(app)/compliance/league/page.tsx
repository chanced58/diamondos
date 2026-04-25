import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueTeamIds, getLeagueOpponentTeamIds } from '@baseball/database';
import { derivePitchingStats, deriveBattingStats, computeOpponentBatting, filterResetAndReverted } from '@baseball/shared';
import type { PitchingStats, BattingStats, StatTier, GameEvent } from '@baseball/shared';
import { buildLineupsByGameId } from '@/lib/stats/lineups';
import { fetchAllEventsForGames } from '@/lib/stats/fetch-events';
import { PitchingStatsTable } from '../PitchingStatsTable';
import { BattingStatsTable } from '../BattingStatsTable';
import { TierToggle } from '../TierToggle';
import { RELEVANT_EVENT_TYPES } from '../constants';

export const metadata: Metadata = { title: 'League Stats' };

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
  if (teamIds.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">{league.name} Stats</h1>
        <p className="text-gray-500 mt-2">No teams in this league yet.</p>
      </div>
    );
  }

  // Include in_progress so live player stats update during games;
  // this page shows individual player stats, not W-L-T standings
  const { data: gamesData, error: gamesError } = await db
    .from('games')
    .select('id, team_id, location_type, neutral_home_team')
    .in('team_id', teamIds)
    .in('status', ['completed', 'in_progress']);
  if (gamesError) throw new Error(`Failed to fetch league games: ${gamesError.message}`);

  const gameIds = (gamesData ?? []).map((g) => g.id);

  // Get all relevant events. The helper paginates through Supabase's
  // default 1000-row PostgREST limit so large leagues' events don't get
  // silently truncated.
  const rawEvents = await fetchAllEventsForGames(
    db,
    gameIds,
    RELEVANT_EVENT_TYPES as unknown as readonly string[],
  );

  // Get all players across all league teams
  const { data: allPlayers, error: playersError } = await db
    .from('players')
    .select('id, team_id, first_name, last_name')
    .in('team_id', teamIds);
  if (playersError) throw new Error(`Failed to fetch players: ${playersError.message}`);

  // Get team names for display
  const { data: teamsData, error: teamsError } = await db
    .from('teams')
    .select('id, name')
    .in('id', teamIds);
  if (teamsError) throw new Error(`Failed to fetch teams: ${teamsError.message}`);
  const teamNameMap = new Map((teamsData ?? []).map((t) => [t.id, t.name]));

  // Build player list with team name included in the display name
  const playerList = (allPlayers ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: `${p.last_name} (${teamNameMap.get(p.team_id) ?? 'Unknown'})`,
  }));

  const allPlayerIds = new Set(playerList.map((p) => p.id));

  // Build per-game lineup context so deriveBattingStats can recover stub
  // batter IDs during our team's half-inning. Best-effort.
  const lineupsByGameId = await buildLineupsByGameId(db, (gamesData ?? []).map((g) => ({
    id: g.id,
    location_type: g.location_type as string,
    neutral_home_team: g.neutral_home_team as string | null,
  })));

  // Filter reverted/reset events before deriving platform stats. The opponent
  // branch below appends more events to rawEvents and re-runs the derivers,
  // which re-applies the filter — filterResetAndReverted is idempotent.
  const platformFilteredEvents = filterResetAndReverted(rawEvents);

  // Compute platform player stats
  const pitchingStatsMap = derivePitchingStats(platformFilteredEvents as unknown as GameEvent[], playerList);
  const allPitchingStats: PitchingStats[] = Array.from(pitchingStatsMap.values())
    .filter((s) => allPlayerIds.has(s.playerId))
    .sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  const battingStatsMap = deriveBattingStats(platformFilteredEvents as unknown as GameEvent[], playerList, lineupsByGameId);
  const allBattingStats: BattingStats[] = Array.from(battingStatsMap.values())
    .filter((s) => allPlayerIds.has(s.playerId))
    .sort((a, b) => b.plateAppearances - a.plateAppearances);

  // Opponent team stats — fetch games and players for league opponent teams
  const opponentTeamIds = await getLeagueOpponentTeamIds(db, league.id);
  if (opponentTeamIds.length > 0) {
    // Get games where opponent_team_id is in the league
    const { data: oppGamesData } = await db
      .from('games')
      .select('id, opponent_team_id')
      .in('opponent_team_id', opponentTeamIds)
      .in('status', ['completed', 'in_progress']);
    const oppGameIds = (oppGamesData ?? []).map((g) => g.id);

    // Fetch events for opponent games not already fetched (dedup). Set
    // lookup keeps this O(n+m) instead of O(n·m); safe-append avoids ever
    // tripping the JS engine's argument-count cap on `.push(...arr)`.
    const gameIdSet = new Set(gameIds);
    const missingGameIds = oppGameIds.filter((id) => !gameIdSet.has(id));
    if (missingGameIds.length > 0) {
      const missingEvents = await fetchAllEventsForGames(
        db,
        missingGameIds,
        RELEVANT_EVENT_TYPES as unknown as readonly string[],
      );
      Array.prototype.push.apply(rawEvents, missingEvents);
    }

    // Fetch opponent players
    const { data: oppPlayers } = await db
      .from('opponent_players')
      .select('id, opponent_team_id, first_name, last_name')
      .in('opponent_team_id', opponentTeamIds);

    // Get opponent team names
    const { data: oppTeamsData } = await db
      .from('opponent_teams')
      .select('id, name')
      .in('id', opponentTeamIds);
    const oppTeamNameMap = new Map((oppTeamsData ?? []).map((t) => [t.id, t.name]));

    // Build opponent player name map for computeOpponentBatting
    const oppPlayerNameMap = new Map<string, string>(
      (oppPlayers ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`]),
    );
    const oppPlayerTeamMap = new Map<string, string>(
      (oppPlayers ?? []).map((p) => [p.id, p.opponent_team_id]),
    );

    // Refilter the now-expanded rawEvents (includes opponent-team games)
    // before computing opponent stats. filterResetAndReverted is idempotent.
    const allFilteredEvents = filterResetAndReverted(rawEvents);

    // Opponent batting stats — map OppBattingRow to BattingStats shape.
    // computeOpponentBatting takes Record<string, unknown>[] directly.
    const oppBattingRows = computeOpponentBatting(allFilteredEvents, oppPlayerNameMap);
    for (const row of oppBattingRows) {
      const oppTeamId = oppPlayerTeamMap.get(row.playerId);
      const teamName = oppTeamId ? oppTeamNameMap.get(oppTeamId) : 'Unknown';
      allBattingStats.push({
        playerId: row.playerId,
        playerName: `${row.playerName} (${teamName})`,
        gamesAppeared: 0,
        plateAppearances: row.pa,
        atBats: row.ab,
        runs: row.r,
        hits: row.h,
        doubles: row.doubles,
        triples: row.triples,
        homeRuns: row.hr,
        rbi: row.rbi,
        walks: row.bb,
        strikeouts: row.k,
        hitByPitch: row.hbp,
        sacrificeFlies: row.sf,
        sacrificeHits: row.sh,
        avg: row.avg,
        obp: row.obp,
        slg: row.slg,
        ops: row.ops,
        iso: (row.slg || 0) - (row.avg || 0),
        babip: NaN,
        kPct: row.pa > 0 ? row.k / row.pa : 0,
        bbPct: row.pa > 0 ? row.bb / row.pa : 0,
        woba: NaN,
        battedBalls: 0,
        hardHitBalls: 0,
        hardHitPct: NaN,
        // Opponent QAB isn't tracked — set to 0 / NaN so the column is
        // blank rather than showing stale values from another schema.
        qab: 0,
        qabPct: NaN,
      });
    }

    // Opponent pitching stats
    const oppPlayerList = (oppPlayers ?? []).map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: `${p.last_name} (${oppTeamNameMap.get(p.opponent_team_id) ?? 'Unknown'})`,
    }));
    const oppPitchingMap = derivePitchingStats(allFilteredEvents as unknown as GameEvent[], oppPlayerList);
    const oppPlayerIds = new Set((oppPlayers ?? []).map((p) => p.id));
    for (const [, s] of oppPitchingMap) {
      if (oppPlayerIds.has(s.playerId) && s.totalPitches > 0) {
        allPitchingStats.push(s);
      }
    }

    // Re-sort after merging
    allBattingStats.sort((a, b) => b.plateAppearances - a.plateAppearances);
    allPitchingStats.sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);
  }

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
