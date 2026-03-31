import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueTeams } from '@baseball/database';
import { derivePitchingStats, deriveBattingStats, weAreHome } from '@baseball/shared';

export const metadata: Metadata = { title: 'Team Comparison' };

const RELEVANT_EVENT_TYPES = [
  'pitch_thrown', 'hit', 'out', 'strikeout', 'walk', 'hit_by_pitch', 'score',
  'pitching_change', 'inning_change', 'game_start', 'double_play', 'sacrifice_bunt',
  'sacrifice_fly', 'field_error', 'stolen_base', 'caught_stealing',
] as const;

type TeamComparisonRow = {
  teamId: string;
  teamName: string;
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
  const teamIds = leagueTeams.map((t) => t.team_id);

  // Get all completed games for all league teams
  const { data: allGames } = await db
    .from('games')
    .select('id, team_id, home_score, away_score, location_type, neutral_home_team, status')
    .in('team_id', teamIds)
    .in('status', ['completed', 'in_progress']);

  // Get all game events
  const gameIds = (allGames ?? []).map((g) => g.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Get all players grouped by team
  const { data: allPlayers } = await db
    .from('players')
    .select('id, team_id, first_name, last_name')
    .in('team_id', teamIds);

  // Build comparison rows per team
  const rows: TeamComparisonRow[] = leagueTeams.map((lt) => {
    const tid = lt.team_id;
    const teamGames = (allGames ?? []).filter((g) => g.team_id === tid);
    const teamGameIds = new Set(teamGames.map((g) => g.id));

    // W-L-T record and runs
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

    // Filter events to this team's games
    const teamEvents = rawEvents.filter((e) => teamGameIds.has(e.game_id));

    // Get players for this team
    const teamPlayers = (allPlayers ?? [])
      .filter((p) => p.team_id === tid)
      .map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name }));
    const teamPlayerIds = new Set(teamPlayers.map((p) => p.id));

    // Batting stats
    const battingMap = deriveBattingStats(teamEvents, teamPlayers);
    let totalHits = 0, totalAB = 0;
    for (const [, s] of battingMap) {
      if (!teamPlayerIds.has(s.playerId)) continue;
      totalHits += s.hits;
      totalAB += s.atBats;
    }
    const teamAvg = totalAB > 0 ? totalHits / totalAB : 0;

    // Pitching stats
    const pitchingMap = derivePitchingStats(teamEvents, teamPlayers);
    let totalOuts = 0, totalRuns = 0, totalK = 0;
    for (const [, s] of pitchingMap) {
      if (!teamPlayerIds.has(s.playerId)) continue;
      totalOuts += s.inningsPitchedOuts;
      totalRuns += s.runsAllowed;
      totalK += s.strikeouts;
    }
    const ip = totalOuts / 3;
    const teamEra = ip > 0 ? (totalRuns * 7) / ip : 0;

    return {
      teamId: tid,
      teamName: lt.teams.name,
      wins,
      losses,
      ties,
      runsScored,
      runsAllowed,
      teamAvg,
      teamEra,
      totalHits,
      totalStrikeouts: totalK,
      gamesPlayed: teamGames.length,
    };
  });

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
