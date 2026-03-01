import { Metadata } from 'next';
import Link from 'next/link'; // kept for the Players section and admin link
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import {
  POSITION_ABBREVIATIONS,
  deriveBattingStats,
  derivePitchingStats,
  formatBattingRate,
  formatInningsPitched,
} from '@baseball/shared';
import type { BattingStats, PitchingStats } from '@baseball/shared';
import { RosterRowActions } from './RosterRowActions';
import { StaffSection } from './StaffSection';
import { ParentSection } from './ParentSection';

export const metadata: Metadata = { title: 'Roster' };

const SEASON_EVENT_TYPES = [
  'pitch_thrown', 'hit', 'out', 'strikeout', 'walk',
  'hit_by_pitch', 'score', 'pitching_change', 'inning_change',
  'game_start', 'double_play', 'sacrifice_bunt', 'sacrifice_fly',
  'field_error',
];

export default async function RosterPage({ params }: { params: { teamId: string } }) {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [playersResult, seasonResult, membershipResult, staffResult, parentsResult, pendingInvitesResult] = await Promise.all([
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number, primary_position, bats, throws, graduation_year')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .order('last_name'),
    db
      .from('seasons')
      .select('id, name')
      .eq('team_id', params.teamId)
      .eq('is_current', true)
      .maybeSingle(),
    db
      .from('team_members')
      .select('role')
      .eq('team_id', params.teamId)
      .eq('user_id', user.id)
      .single(),
    db
      .from('team_members')
      .select('id, role, user_id, user_profiles(first_name, last_name, email, phone)')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .in('role', ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper', 'staff']),
    db
      .from('team_members')
      .select('id, role, user_id, user_profiles(first_name, last_name, email, phone)')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .eq('role', 'parent'),
    db
      .from('team_invitations')
      .select('id, email, first_name, last_name, phone, role')
      .eq('team_id', params.teamId)
      .eq('status', 'pending')
      .not('email', 'like', '%@placeholder.internal'),
  ]);

  const players = playersResult.data ?? [];
  const season = seasonResult.data;
  const role = membershipResult.data?.role;
  const isCoach =
    role === 'head_coach' ||
    role === 'assistant_coach' ||
    role === 'athletic_director' ||
    role === 'scorekeeper' ||
    role === 'staff';
  const canInviteStaff = role === 'head_coach' || role === 'assistant_coach' || role === 'athletic_director';

  const staff = (staffResult.data ?? []).map((row: any) => ({
    id: row.id as string,
    userId: row.user_id as string,
    role: row.role as string,
    firstName: (row.user_profiles as any)?.first_name ?? null as string | null,
    lastName: (row.user_profiles as any)?.last_name ?? null as string | null,
    email: (row.user_profiles as any)?.email ?? null as string | null,
    phone: (row.user_profiles as any)?.phone ?? null as string | null,
  }));

  const parentRows = (parentsResult.data ?? []).map((row: any) => ({
    id: row.id as string,
    userId: row.user_id as string,
    firstName: (row.user_profiles as any)?.first_name ?? null as string | null,
    lastName: (row.user_profiles as any)?.last_name ?? null as string | null,
    email: (row.user_profiles as any)?.email ?? null as string | null,
    phone: (row.user_profiles as any)?.phone ?? null as string | null,
  }));

  const STAFF_ROLES = ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper', 'staff'];
  const allPendingInvites = (pendingInvitesResult.data ?? []).map((inv: any) => ({
    id: inv.id as string,
    email: inv.email as string,
    firstName: inv.first_name as string | null,
    lastName: inv.last_name as string | null,
    phone: inv.phone as string | null,
    role: inv.role as string,
  }));
  const pendingStaff = allPendingInvites.filter((inv) => STAFF_ROLES.includes(inv.role));
  const pendingParents = allPendingInvites.filter((inv) => inv.role === 'parent');

  // Fetch parent→player links
  let parentLinks: { parentUserId: string; playerName: string }[] = [];
  if (parentRows.length > 0) {
    const { data: links } = await db
      .from('parent_player_links')
      .select('parent_user_id, players(first_name, last_name)')
      .in('parent_user_id', parentRows.map((p) => p.userId));
    parentLinks = (links ?? []).map((l: any) => ({
      parentUserId: l.parent_user_id as string,
      playerName: l.players
        ? `${(l.players as any).last_name}, ${(l.players as any).first_name}`
        : 'Unknown',
    }));
  }

  // Fetch season stats
  const battingMap = new Map<string, BattingStats>();
  const pitchingMap = new Map<string, PitchingStats>();

  if (season && players.length > 0) {
    const { data: games } = await db
      .from('games')
      .select('id')
      .eq('team_id', params.teamId)
      .eq('season_id', season.id);

    const gameIds = (games ?? []).map((g) => g.id);

    if (gameIds.length > 0) {
      const { data: events } = await db
        .from('game_events')
        .select('*')
        .in('game_id', gameIds)
        .in('event_type', SEASON_EVENT_TYPES)
        .order('game_id')
        .order('sequence_number');

      if (events && events.length > 0) {
        const playerList = players.map((p) => ({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
        }));

        const bMap = deriveBattingStats(events, playerList);
        for (const [id, s] of bMap) {
          if (s.plateAppearances > 0) battingMap.set(id, s);
        }

        const pMap = derivePitchingStats(events, playerList);
        for (const [id, s] of pMap) {
          if (s.totalPitches > 0) pitchingMap.set(id, s);
        }
      }
    }
  }

  const hasStats = battingMap.size > 0 || pitchingMap.size > 0;

  return (
    <div className="p-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Roster</h1>
        {season && <p className="text-gray-500 text-sm mt-1">{season.name}</p>}
      </div>

      {/* ── Players ──────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Players</h2>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
              {players.length}
            </span>
          </div>
          {isCoach && (
            <Link
              href={`/teams/${params.teamId}/roster/new`}
              className="text-xs text-brand-700 hover:underline font-medium"
            >
              + Add player
            </Link>
          )}
        </div>

        {players.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No players on the roster yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium w-12">#</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Pos</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">B/T</th>
                  <th className="text-left px-4 py-3 text-gray-500 font-medium">Yr</th>
                  {hasStats && (
                    <>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium" title="Batting average">AVG</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium" title="On-base percentage">OBP</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium" title="Slugging percentage">SLG</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium" title="OBP + SLG">OPS</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium" title="Innings pitched">IP</th>
                      <th className="text-right px-3 py-3 text-gray-500 font-medium" title="Earned run average (per 7 inn)">ERA</th>
                    </>
                  )}
                  {isCoach && (
                    <th className="text-right px-4 py-3 text-gray-500 font-medium">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {players.map((player) => {
                  const b = battingMap.get(player.id);
                  const p = pitchingMap.get(player.id);
                  return (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-500">
                        {player.jersey_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <Link
                          href={`/teams/${params.teamId}/roster/${player.id}`}
                          className="hover:text-brand-700 transition-colors"
                        >
                          {player.last_name}, {player.first_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {player.primary_position
                          ? POSITION_ABBREVIATIONS[player.primary_position]
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {player.bats && player.throws
                          ? `${player.bats[0].toUpperCase()}/${player.throws[0].toUpperCase()}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {player.graduation_year ?? '—'}
                      </td>
                      {hasStats && (
                        <>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {b ? formatBattingRate(b.avg) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {b ? formatBattingRate(b.obp) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {b ? formatBattingRate(b.slg) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {b ? formatBattingRate(b.ops) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {p ? formatInningsPitched(p.inningsPitchedOuts) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums text-gray-700">
                            {p
                              ? isFinite(p.era) ? p.era.toFixed(2) : '—'
                              : <span className="text-gray-300">—</span>}
                          </td>
                        </>
                      )}
                      {isCoach && (
                        <td className="px-4 py-3 text-right">
                          <RosterRowActions
                            teamId={params.teamId}
                            playerId={player.id}
                            playerName={`${player.first_name} ${player.last_name}`}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Coaches & Staff ──────────────────────────────────────── */}
      <StaffSection
        teamId={params.teamId}
        staff={staff}
        pendingInvitations={pendingStaff}
        canInvite={isCoach}
      />

      {/* ── Parents ──────────────────────────────────────────────── */}
      <ParentSection
        teamId={params.teamId}
        parents={parentRows}
        parentLinks={parentLinks}
        pendingInvitations={pendingParents}
        players={players.map((p) => ({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          jerseyNumber: p.jersey_number,
        }))}
        canInvite={isCoach}
      />

      {canInviteStaff && (
        <div className="pt-2 border-t border-gray-100">
          <Link
            href={`/teams/${params.teamId}/admin/users`}
            className="text-sm text-gray-500 hover:text-brand-700 hover:underline"
          >
            Manage users &amp; invitations →
          </Link>
        </div>
      )}
    </div>
  );
}
