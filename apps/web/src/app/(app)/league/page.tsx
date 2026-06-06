import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getActiveLeague } from '@/lib/active-league';
import { getLeagueAccess } from '@/lib/league-access';
import { getLeagueTeams, getLeagueDivisions, getLeagueStaff, leagueMemberName } from '@baseball/database';
import { weAreHome, mergeWithThemeDefaults } from '@baseball/shared';
import { StandingsBoard, type StandingsDivision, type StandingsTeamRow, type GameResult } from './StandingsBoard';

export const metadata: Metadata = { title: 'League' };

export default async function LeaguePage(): Promise<JSX.Element | null> {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(supabase, user.id);
  if (!activeTeam) redirect('/dashboard');

  const league = await getActiveLeague(activeTeam.id);
  if (!league) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">League</h1>
        <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-xl p-6 max-w-md">
          <h2 className="text-lg font-semibold text-yellow-900 mb-2">No league</h2>
          <p className="text-yellow-700">
            Your team is not currently part of a league. Contact your league administrator to be added.
          </p>
        </div>
      </div>
    );
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [teams, divisions, staff, access, themeRow] = await Promise.all([
    getLeagueTeams(db, league.id),
    getLeagueDivisions(db, league.id),
    getLeagueStaff(db, league.id),
    getLeagueAccess(league.id, user.id),
    db.from('leagues').select('home_theme').eq('id', league.id).maybeSingle(),
  ]);
  // The admin-selected color scheme themes this dashboard's accents to match the
  // public league page (visitor light/dark base is unchanged).
  const colorScheme = mergeWithThemeDefaults(themeRow.data?.home_theme).colorScheme;

  // Build standings from completed games — platform teams + opponent teams
  const platformIds = teams.filter((t) => t.team_id).map((t) => t.team_id!);
  const opponentIds = teams.filter((t) => t.opponent_team_id).map((t) => t.opponent_team_id!);

  type GameOutcome = { date: string | null; result: GameResult };
  type TeamRecord = {
    wins: number;
    losses: number;
    ties: number;
    rf: number;
    ra: number;
    games: GameOutcome[];
  };
  const records = new Map<string, TeamRecord>();
  for (const t of teams) {
    records.set((t.team_id ?? t.opponent_team_id)!, { wins: 0, losses: 0, ties: 0, rf: 0, ra: 0, games: [] });
  }
  const gameIds = new Set<string>();

  const tally = (rec: TeamRecord, our: number, their: number, date: string | null): void => {
    const result: GameResult = our > their ? 'W' : our < their ? 'L' : 'T';
    if (result === 'W') rec.wins++;
    else if (result === 'L') rec.losses++;
    else rec.ties++;
    rec.rf += our;
    rec.ra += their;
    rec.games.push({ date, result });
  };

  // Platform team games (team_id perspective)
  if (platformIds.length > 0) {
    const { data: platformGames, error: pgErr } = await db
      .from('games')
      .select('id, team_id, home_score, away_score, location_type, neutral_home_team, scheduled_at')
      .in('team_id', platformIds)
      .eq('status', 'completed');
    if (pgErr) throw new Error(`Failed to fetch platform games: ${pgErr.message}`);
    for (const g of platformGames) {
      gameIds.add(g.id);
      const rec = records.get(g.team_id);
      if (!rec) continue;
      const isHome = weAreHome(g.location_type, g.neutral_home_team);
      const our = isHome ? g.home_score : g.away_score;
      const their = isHome ? g.away_score : g.home_score;
      tally(rec, our, their, g.scheduled_at);
    }
  }

  // Opponent team games (inverse perspective — opponent is the other side)
  if (opponentIds.length > 0) {
    const { data: oppGames, error: ogErr } = await db
      .from('games')
      .select('id, opponent_team_id, home_score, away_score, location_type, neutral_home_team, scheduled_at')
      .in('opponent_team_id', opponentIds)
      .eq('status', 'completed');
    if (ogErr) throw new Error(`Failed to fetch opponent games: ${ogErr.message}`);
    for (const g of oppGames) {
      gameIds.add(g.id);
      const rec = records.get(g.opponent_team_id);
      if (!rec) continue;
      // Opponent is the inverse side of the coaching team
      const coachIsHome = weAreHome(g.location_type, g.neutral_home_team);
      const our = coachIsHome ? g.away_score : g.home_score;
      const their = coachIsHome ? g.home_score : g.away_score;
      tally(rec, our, their, g.scheduled_at);
    }
  }

  // Group teams by division
  const divisionMap = new Map<string | null, typeof teams>();
  for (const t of teams) {
    const divId = t.division_id;
    if (!divisionMap.has(divId)) divisionMap.set(divId, []);
    divisionMap.get(divId)!.push(t);
  }

  const divisionNames = new Map(divisions.map((d) => [d.id, d.name]));

  // Derive the most-recent-five form line and the current streak from a team's games.
  const summarize = (
    games: GameOutcome[],
  ): { last5: GameResult[]; streak: { type: GameResult; count: number } | null } => {
    const ordered = [...games].sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return ta - tb; // oldest first
    });
    const last5 = ordered.slice(-5).map((g) => g.result);
    let streak: { type: GameResult; count: number } | null = null;
    for (let i = ordered.length - 1; i >= 0; i--) {
      const r = ordered[i].result;
      if (!streak) streak = { type: r, count: 1 };
      else if (streak.type === r) streak.count++;
      else break;
    }
    return { last5, streak };
  };

  const toRow = (t: (typeof teams)[number]): StandingsTeamRow => {
    const key = (t.team_id ?? t.opponent_team_id)!;
    const rec = records.get(key) ?? { wins: 0, losses: 0, ties: 0, rf: 0, ra: 0, games: [] };
    const total = rec.wins + rec.losses + rec.ties;
    const { last5, streak } = summarize(rec.games);
    return {
      key,
      name: leagueMemberName(t),
      organization: t.teams?.organization ?? null,
      teamId: t.team_id ?? null,
      isActive: t.team_id === activeTeam.id,
      isOpponent: !!t.opponent_team_id,
      wins: rec.wins,
      losses: rec.losses,
      ties: rec.ties,
      pct: total > 0 ? rec.wins / total : 0,
      rf: rec.rf,
      ra: rec.ra,
      diff: rec.rf - rec.ra,
      gamesPlayed: total,
      last5,
      streak,
    };
  };

  const enrichedDivisions: StandingsDivision[] = [...divisionMap.entries()]
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return (divisionNames.get(a) ?? '').localeCompare(divisionNames.get(b) ?? '');
    })
    .map(([divId, divTeams]) => ({
      id: divId ?? 'none',
      name: divId ? divisionNames.get(divId) ?? 'Division' : divisions.length > 0 ? 'Unassigned' : 'Teams',
      teams: divTeams.map(toRow),
    }));

  // Counters strip: Teams · Divisions · Games Played · Your Rank (overall, by win%).
  const allRows = enrichedDivisions.flatMap((d) => d.teams);
  const rankedByPct = [...allRows].sort((a, b) => b.pct - a.pct || b.wins - a.wins);
  const yourIndex = rankedByPct.findIndex((r) => r.isActive);
  const counters: Array<{ label: string; value: string }> = [
    { label: 'Teams', value: String(teams.length) },
    { label: 'Divisions', value: String(divisions.length) },
    { label: 'Games Played', value: String(gameIds.size) },
    { label: 'Your Rank', value: yourIndex >= 0 ? `#${yourIndex + 1}` : '—' },
  ];

  return (
    <div className={`league-scheme-${colorScheme} p-8`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
          {league.description && (
            <p className="text-gray-500 mt-1">{league.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {league.slug && (
            <Link
              href={`/l/${league.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              View public home page
            </Link>
          )}
          {access.isLeagueAdmin && (
            <Link
              href="/league/admin"
              className="text-sm font-medium bg-brand-700 text-white px-4 py-2 rounded-lg hover:bg-brand-800 transition-colors"
            >
              Manage League
            </Link>
          )}
        </div>
      </div>

      {/* Counters strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map((c) => (
          <div key={c.label} className="rounded-xl border border-app-border bg-app-surface px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wide text-app-fg-muted">{c.label}</div>
            <div className="mono mt-1 text-2xl font-bold text-app-fg">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Standings by division — sortable, with last-5, streak, and expandable detail */}
      <StandingsBoard divisions={enrichedDivisions} />

      {/* League Staff */}
      {staff.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">League Staff</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {staff.map((s) => {
              const profile = Array.isArray(s.user_profiles) ? s.user_profiles[0] : s.user_profiles;
              const name = profile
                ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Staff'
                : 'Unknown';
              return (
                <li key={s.id} className="px-6 py-3 flex items-center justify-between">
                  <span className="text-sm text-gray-900">{name}</span>
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {s.role === 'league_admin' ? 'Admin' : 'Manager'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
