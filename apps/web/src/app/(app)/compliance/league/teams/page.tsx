import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueTeams, leagueMemberName } from '@baseball/database';
import { derivePitchingStats, deriveBattingStats, computeOpponentBatting, filterResetAndReverted, weAreHome } from '@baseball/shared';
import { buildLineupsByGameId } from '@/lib/stats/lineups';
import { RELEVANT_EVENT_TYPES } from '../../constants';

export const metadata: Metadata = { title: 'Team Comparison' };

type TeamComparisonRow = {
  teamId: string;
  teamName: string;
  isOpponentTeam: boolean;
  wins: number;
  losses: number;
  ties: number;
  runsScored: number;
  runsAllowed: number;
  teamAvg: number;
  teamEra: number;
  totalHits: number;
  totalStrikeouts: number;
  gamesPlayed: number;
};

export default async function TeamComparisonPage(): Promise<JSX.Element | null> {
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

  const leagueTeams = await getLeagueTeams(db, league.id);
  const platformMembers = leagueTeams.filter((t) => t.team_id);
  const opponentMembers = leagueTeams.filter((t) => t.opponent_team_id);
  const platformIds = platformMembers.map((t) => t.team_id!);
  const opponentIds = opponentMembers.map((t) => t.opponent_team_id!);

  if (leagueTeams.length === 0) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900">Team Comparison</h1>
        <p className="text-gray-500 mt-2">No teams in this league yet.</p>
      </div>
    );
  }

  // Get all completed games involving league members
  const { data: allGames, error: gamesError } = platformIds.length > 0
    ? await db
        .from('games')
        .select('id, team_id, opponent_team_id, home_score, away_score, location_type, neutral_home_team')
        .in('team_id', platformIds)
        .eq('status', 'completed')
    : { data: [] as any[], error: null };
  if (gamesError) throw new Error(`Failed to fetch league games: ${gamesError.message}`);

  // Get all game events — fetch in batches
  const gameIds = (allGames ?? []).map((g: any) => g.id);
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

  // Filter reverted/reset events before any per-team derivation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filteredEvents: any[] = filterResetAndReverted(rawEvents) as any[];

  // Build per-game lineup context for all platform-team games. Best-effort.
  const lineupsByGameId = await buildLineupsByGameId(db, ((allGames ?? []) as any[]).map((g) => ({
    id: g.id as string,
    location_type: g.location_type as string,
    neutral_home_team: g.neutral_home_team as string | null,
  })));

  // Get all platform players
  const { data: allPlayers } = platformIds.length > 0
    ? await db.from('players').select('id, team_id, first_name, last_name').in('team_id', platformIds)
    : { data: [] as any[] };

  // Get opponent players
  const { data: oppPlayers } = opponentIds.length > 0
    ? await db.from('opponent_players').select('id, opponent_team_id, first_name, last_name').in('opponent_team_id', opponentIds)
    : { data: [] as any[] };

  const rows: TeamComparisonRow[] = [];

  // Platform team rows
  for (const lt of platformMembers) {
    const tid = lt.team_id!;
    const teamGames = (allGames ?? []).filter((g: any) => g.team_id === tid);
    const teamGameIds = new Set(teamGames.map((g: any) => g.id));

    let wins = 0, losses = 0, ties = 0, runsScored = 0, runsAllowed = 0;
    for (const g of teamGames) {
      const isHome = weAreHome(g.location_type, g.neutral_home_team);
      const our = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0);
      const their = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0);
      runsScored += our;
      runsAllowed += their;
      if (our > their) wins++;
      else if (their > our) losses++;
      else ties++;
    }

    const teamEvents = filteredEvents.filter((e: any) => teamGameIds.has(e.game_id));
    const teamPlayers = (allPlayers ?? [])
      .filter((p: any) => p.team_id === tid)
      .map((p: any) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name }));
    const teamPlayerIds = new Set(teamPlayers.map((p: any) => p.id));

    const battingMap = deriveBattingStats(teamEvents, teamPlayers, lineupsByGameId);
    let totalHits = 0, totalAB = 0;
    for (const [, s] of battingMap) {
      if (!teamPlayerIds.has(s.playerId)) continue;
      totalHits += s.hits;
      totalAB += s.atBats;
    }

    const pitchingMap = derivePitchingStats(teamEvents, teamPlayers);
    let totalOuts = 0, totalRuns = 0, totalK = 0;
    for (const [, s] of pitchingMap) {
      if (!teamPlayerIds.has(s.playerId)) continue;
      totalOuts += s.inningsPitchedOuts;
      totalRuns += s.runsAllowed;
      totalK += s.strikeouts;
    }
    const ip = totalOuts / 3;

    rows.push({
      teamId: tid,
      teamName: leagueMemberName(lt),
      isOpponentTeam: false,
      wins, losses, ties, runsScored, runsAllowed,
      teamAvg: totalAB > 0 ? totalHits / totalAB : 0,
      teamEra: ip > 0 ? (totalRuns * 7) / ip : 0,
      totalHits,
      totalStrikeouts: totalK,
      gamesPlayed: teamGames.length,
    });
  }

  // Opponent team rows (inverse perspective)
  for (const lt of opponentMembers) {
    const otId = lt.opponent_team_id!;
    const oppGames = (allGames ?? []).filter((g: any) => g.opponent_team_id === otId);
    const oppGameIds = new Set(oppGames.map((g: any) => g.id));

    let wins = 0, losses = 0, ties = 0, runsScored = 0, runsAllowed = 0;
    for (const g of oppGames) {
      const coachIsHome = weAreHome(g.location_type, g.neutral_home_team);
      const our = coachIsHome ? (g.away_score ?? 0) : (g.home_score ?? 0);
      const their = coachIsHome ? (g.home_score ?? 0) : (g.away_score ?? 0);
      runsScored += our;
      runsAllowed += their;
      if (our > their) wins++;
      else if (their > our) losses++;
      else ties++;
    }

    const oppEvents = filteredEvents.filter((e: any) => oppGameIds.has(e.game_id));
    const thisOppPlayers = (oppPlayers ?? []).filter((p: any) => p.opponent_team_id === otId);
    const oppPlayerNameMap = new Map<string, string>(
      thisOppPlayers.map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]),
    );
    const oppPlayerIds = new Set(thisOppPlayers.map((p: any) => p.id));

    // Opponent batting via computeOpponentBatting
    const oppBatting = computeOpponentBatting(oppEvents, oppPlayerNameMap);
    let totalHits = 0, totalAB = 0;
    for (const s of oppBatting) {
      totalHits += s.h;
      totalAB += s.ab;
    }

    // Opponent pitching via derivePitchingStats
    const oppPlayerList = thisOppPlayers.map((p: any) => ({
      id: p.id, firstName: p.first_name, lastName: p.last_name,
    }));
    const oppPitchingMap = derivePitchingStats(oppEvents, oppPlayerList);
    let totalOuts = 0, totalRuns = 0, totalK = 0;
    for (const [, s] of oppPitchingMap) {
      if (!oppPlayerIds.has(s.playerId)) continue;
      totalOuts += s.inningsPitchedOuts;
      totalRuns += s.runsAllowed;
      totalK += s.strikeouts;
    }
    const ip = totalOuts / 3;

    rows.push({
      teamId: otId,
      teamName: leagueMemberName(lt),
      isOpponentTeam: true,
      wins, losses, ties, runsScored, runsAllowed,
      teamAvg: totalAB > 0 ? totalHits / totalAB : 0,
      teamEra: ip > 0 ? (totalRuns * 7) / ip : 0,
      totalHits,
      totalStrikeouts: totalK,
      gamesPlayed: oppGames.length,
    });
  }

  // Sort by win percentage
  rows.sort((a, b) => {
    const aTotal = a.wins + a.losses + a.ties;
    const bTotal = b.wins + b.losses + b.ties;
    const aPct = aTotal > 0 ? a.wins / aTotal : 0;
    const bPct = bTotal > 0 ? b.wins / bTotal : 0;
    return bPct - aPct;
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Team Comparison</h1>
          <Link
            href="/compliance/league"
            className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors"
          >
            Player Stats
          </Link>
          <Link
            href="/compliance"
            className="text-xs font-medium text-gray-600 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Team Stats
          </Link>
        </div>
        <p className="text-gray-500 text-sm mt-2">{league.name}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 sticky left-0 bg-white">Team</th>
                <th className="px-4 py-3 text-center">GP</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">T</th>
                <th className="px-4 py-3 text-center">PCT</th>
                <th className="px-4 py-3 text-center">RS</th>
                <th className="px-4 py-3 text-center">RA</th>
                <th className="px-4 py-3 text-center">AVG</th>
                <th className="px-4 py-3 text-center">ERA</th>
                <th className="px-4 py-3 text-center">H</th>
                <th className="px-4 py-3 text-center">K</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const total = r.wins + r.losses + r.ties;
                const pct = total > 0 ? r.wins / total : 0;
                const isMyTeam = r.teamId === activeTeam.id;
                return (
                  <tr key={r.teamId} className={isMyTeam ? 'bg-brand-50' : ''}>
                    <td className={`px-6 py-3 font-medium text-gray-900 sticky left-0 ${isMyTeam ? 'bg-brand-50' : 'bg-white'}`}>
                      {r.teamName}
                      {r.isOpponentTeam && (
                        <span className="ml-2 text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Opponent</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.gamesPlayed}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.wins}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.losses}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.ties}</td>
                    <td className="px-4 py-3 text-center tabular-nums font-mono">
                      {pct.toFixed(3).replace(/^0/, '')}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.runsScored}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.runsAllowed}</td>
                    <td className="px-4 py-3 text-center tabular-nums font-mono">
                      {r.teamAvg.toFixed(3).replace(/^0/, '')}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums font-mono">
                      {r.teamEra.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.totalHits}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{r.totalStrikeouts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
