import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link'; // kept for the Players section and admin link
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { addToTeamChannels } from '@/lib/team-channels';
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

const STAFF_ROLES = ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper', 'staff'];

/**
 * Self-healing: for each pending invitation whose email matches an existing
 * auth user, create the team_members row, accept the invitation, and add
 * to team channels. Returns the IDs of invitations that were promoted.
 */
async function healPendingInvitations(
  db: SupabaseClient,
  teamId: string,
  pendingInvites: Array<{ id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null; role: string }>,
): Promise<Set<string>> {
  const promoted = new Set<string>();
  if (pendingInvites.length === 0) return promoted;

  // Collect all non-placeholder emails from pending invitations
  const realInvites = pendingInvites.filter((inv) => !inv.email.includes('@placeholder.internal'));
  if (realInvites.length === 0) return promoted;

  // Batch-check which emails belong to existing auth users via user_profiles
  const emails = realInvites.map((inv) => inv.email.toLowerCase());
  const { data: matchedProfiles } = await db
    .from('user_profiles')
    .select('id, email, first_name, last_name, phone')
    .in('email', emails);

  // Also check auth.users directly for emails not found in user_profiles
  // (user_profiles.email can be null if trigger didn't backfill)
  const profileEmails = new Set((matchedProfiles ?? []).map((p) => p.email?.toLowerCase()));
  const unmatchedEmails = emails.filter((e) => !profileEmails.has(e));

  const emailToUserId = new Map<string, string>();
  const emailToProfile = new Map<string, { first_name: string | null; last_name: string | null; phone: string | null }>();

  for (const p of matchedProfiles ?? []) {
    if (p.email) {
      emailToUserId.set(p.email.toLowerCase(), p.id);
      emailToProfile.set(p.email.toLowerCase(), p);
    }
  }

  // For unmatched emails, try auth.users via RPC
  for (const email of unmatchedEmails) {
    try {
      const { data: authId } = await db.rpc('find_auth_user_id_by_email', { p_email: email });
      if (authId) {
        emailToUserId.set(email, authId);
        // Fetch their profile
        const { data: prof } = await db.from('user_profiles').select('first_name, last_name, phone').eq('id', authId).maybeSingle();
        if (prof) emailToProfile.set(email, prof);
      }
    } catch {
      // Non-fatal
    }
  }

  // For each pending invitation with a matched user, create team_members and accept
  for (const invite of realInvites) {
    const userId = emailToUserId.get(invite.email.toLowerCase());
    if (!userId) continue;

    try {
      // Create team_members row (or reactivate if deactivated)
      await db.from('team_members').upsert(
        { team_id: teamId, user_id: userId, role: invite.role, is_active: true },
        { onConflict: 'team_id,user_id' },
      );

      // Mark invitation as accepted
      await db.from('team_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invite.id);

      // Backfill profile name from invitation if missing
      const profile = emailToProfile.get(invite.email.toLowerCase());
      const updates: Record<string, string> = {};
      if (!profile?.first_name && invite.first_name) updates.first_name = invite.first_name;
      if (!profile?.last_name && invite.last_name) updates.last_name = invite.last_name;
      if (Object.keys(updates).length > 0) {
        await db.from('user_profiles').update(updates).eq('id', userId);
      }

      // Add to team channels
      await addToTeamChannels(db, teamId, userId, invite.role);

      promoted.add(invite.id);
      console.log(`[Roster] Self-healed invitation ${invite.id} for ${invite.email} → team_members created`);
    } catch (err) {
      console.error(`[Roster] Failed to heal invitation ${invite.id}:`, err);
    }
  }

  return promoted;
}

export default async function RosterPage({ params }: { params: { teamId: string } }): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Fetch pending invitations FIRST so we can self-heal before building the roster
  const { data: pendingInvitesRaw, error: pendingErr } = await db
    .from('team_invitations')
    .select('id, email, first_name, last_name, phone, role')
    .eq('team_id', params.teamId)
    .eq('status', 'pending');

  if (pendingErr) {
    console.error('[Roster] pending invites query failed:', pendingErr.message);
  }

  // Self-heal: promote pending invitations to team_members for users who already exist
  const promotedIds = await healPendingInvitations(db, params.teamId, pendingInvitesRaw ?? []);

  // Now fetch the rest of the data (team_members will include newly healed members)
  const [playersResult, seasonResult, membershipResult, staffMembersResult, parentMembersResult] = await Promise.all([
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number, primary_position, bats, throws, graduation_year, email, user_id')
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
      .eq('is_active', true)
      .maybeSingle(),
    // Fetch staff (now includes any freshly healed members)
    db
      .from('team_members')
      .select('id, role, user_id')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .in('role', ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper', 'staff']),
    // Fetch parents
    db
      .from('team_members')
      .select('id, role, user_id')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .eq('role', 'parent'),
  ]);

  // Surface query errors instead of silently swallowing them
  if (staffMembersResult.error) {
    console.error('[Roster] staff query failed:', staffMembersResult.error.message);
  }
  if (parentMembersResult.error) {
    console.error('[Roster] parent query failed:', parentMembersResult.error.message);
  }

  const players = playersResult.data ?? [];
  const season = seasonResult.data;
  const role = membershipResult.data?.role;
  const { isCoach: hasCoachAccess, isPlatformAdmin } = await getUserAccess(params.teamId, user.id);
  const isCoach =
    hasCoachAccess ||
    role === 'scorekeeper' ||
    role === 'staff';
  const canInviteStaff = isPlatformAdmin || role === 'head_coach' || role === 'assistant_coach' || role === 'athletic_director';

  // Fetch user profiles separately to avoid PostgREST join issues
  const allMemberRows = [...(staffMembersResult.data ?? []), ...(parentMembersResult.data ?? [])];
  const memberUserIds = allMemberRows.map((m) => m.user_id);
  const profileMap = new Map<string, { first_name: string; last_name: string; email: string | null; phone: string | null }>();

  // Optionally fetch jersey_number from team_members (column may not exist yet)
  const staffIds = (staffMembersResult.data ?? []).map((m) => m.id as string);
  const jerseyMap = new Map<string, number | null>();
  if (staffIds.length > 0) {
    const { data: jerseyRows } = await db
      .from('team_members')
      .select('id, jersey_number')
      .in('id', staffIds);
    // If the column doesn't exist the query returns null — that's fine, we just skip
    for (const r of jerseyRows ?? []) {
      jerseyMap.set(r.id, (r as unknown as { id: string; jersey_number?: number | null }).jersey_number ?? null);
    }
  }

  if (memberUserIds.length > 0) {
    const { data: profiles } = await db
      .from('user_profiles')
      .select('id, first_name, last_name, email, phone')
      .in('id', memberUserIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id, p);
    }
  }

  const staff = (staffMembersResult.data ?? []).map((row) => {
    const profile = profileMap.get(row.user_id);
    return {
      id: row.id as string,
      userId: row.user_id as string,
      role: row.role as string,
      jerseyNumber: jerseyMap.get(row.id) ?? null,
      firstName: profile?.first_name || null as string | null,
      lastName: profile?.last_name || null as string | null,
      email: profile?.email ?? null as string | null,
      phone: profile?.phone ?? null as string | null,
    };
  });

  const parentRows = (parentMembersResult.data ?? []).map((row) => {
    const profile = profileMap.get(row.user_id);
    return {
      id: row.id as string,
      userId: row.user_id as string,
      firstName: profile?.first_name || null as string | null,
      lastName: profile?.last_name || null as string | null,
      email: profile?.email ?? null as string | null,
      phone: profile?.phone ?? null as string | null,
    };
  });

  // Filter out promoted invitations — they're now in the staff/parent lists
  const remainingPending = (pendingInvitesRaw ?? []).filter((inv) => !promotedIds.has(inv.id));

  // Optionally fetch jersey_number from pending invitations (column may not exist yet)
  const inviteIds = remainingPending.map((inv) => inv.id as string);
  const inviteJerseyMap = new Map<string, number | null>();
  if (inviteIds.length > 0) {
    const { data: invJerseyRows } = await db
      .from('team_invitations')
      .select('id, jersey_number')
      .in('id', inviteIds);
    for (const r of invJerseyRows ?? []) {
      inviteJerseyMap.set(r.id, (r as unknown as { id: string; jersey_number?: number | null }).jersey_number ?? null);
    }
  }

  const allPendingInvites = remainingPending.map((inv) => ({
    id: inv.id as string,
    email: inv.email as string,
    firstName: inv.first_name as string | null,
    lastName: inv.last_name as string | null,
    phone: inv.phone as string | null,
    role: inv.role as string,
    jerseyNumber: inviteJerseyMap.get(inv.id) ?? null,
  }));
  const pendingStaff = allPendingInvites.filter((inv) => STAFF_ROLES.includes(inv.role));
  const pendingParents = allPendingInvites.filter((inv) => inv.role === 'parent');
  const pendingPlayerEmails = new Set(
    allPendingInvites.filter((inv) => inv.role === 'player').map((inv) => inv.email),
  );

  // Fetch parent→player links
  let parentLinks: { parentUserId: string; playerName: string }[] = [];
  if (parentRows.length > 0) {
    const { data: links } = await db
      .from('parent_player_links')
      .select('parent_user_id, players(first_name, last_name)')
      .in('parent_user_id', parentRows.map((p) => p.userId));
    parentLinks = (links ?? []).map((l) => {
      const p = l.players as unknown as { first_name: string; last_name: string } | null;
      return {
        parentUserId: l.parent_user_id as string,
        playerName: p ? `${p.last_name}, ${p.first_name}` : 'Unknown',
      };
    });
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
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/teams/${params.teamId}/roster/${player.id}`}
                            className="hover:text-brand-700 transition-colors"
                          >
                            {player.last_name}, {player.first_name}
                          </Link>
                          {player.email && pendingPlayerEmails.has(player.email) ? (
                            <span className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full font-normal">
                              Invite pending
                            </span>
                          ) : null}
                        </div>
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
