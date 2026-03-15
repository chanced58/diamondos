import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { formatDate, formatTime } from '@baseball/shared';
import { GameNotesForm } from '../GameNotesForm';
import { PlayerGameView } from '../PlayerGameView';

export const metadata: Metadata = { title: 'Game Notes' };

export default async function GameNotesPage({
  params,
}: {
  params: { gameId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing required Supabase environment variables');
  }

  // Service role client — bypasses RLS for server-side admin queries
  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: game } = await db
    .from('games')
    .select('*')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  // Determine role + linked player record in parallel
  const [membershipResult, playerResult, linkedPlayersResult, access] = await Promise.all([
    db
      .from('team_members')
      .select('role')
      .eq('team_id', game.team_id)
      .eq('user_id', user.id)
      .single(),
    // Player linked directly to this user on this team
    db
      .from('players')
      .select('id, first_name, last_name')
      .eq('team_id', game.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    // Players linked via parent_player_links
    db
      .from('parent_player_links')
      .select('player_id, players(id, first_name, last_name, team_id)')
      .eq('parent_user_id', user.id),
    getUserAccess(game.team_id, user.id),
  ]);

  const role = membershipResult.data?.role;
  const isCoach = access.isCoach;
  const isParent = role === 'parent';
  const playerRecord = playerResult.data;

  // Non-admin users must be team members to view
  if (!isCoach && !role) notFound();

  // Filter linked players to only those on this team
  const linkedPlayers = (linkedPlayersResult.data ?? [])
    .map((link) => {
      const raw = link.players as unknown;
      return (Array.isArray(raw) ? raw[0] : raw) as { id: string; first_name: string; last_name: string; team_id: string } | null;
    })
    .filter((p): p is { id: string; first_name: string; last_name: string; team_id: string } =>
      p !== null && p.team_id === game.team_id,
    );

  const vsAt = game.location_type === 'away' ? '@' : 'vs';

  const header = (
    <div className="mb-8">
      <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
        ← Back to game
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">
        {vsAt} {game.opponent_name} — Notes
      </h1>
      <p className="text-gray-500 text-sm mt-0.5">
        {formatDate(game.scheduled_at)} · {formatTime(game.scheduled_at)}
      </p>
    </div>
  );

  // ── Coach view ──────────────────────────────────────────────────────────────
  if (isCoach) {
    const [playersResult, notesResult, coachNotesResult, playerNotesResult] = await Promise.all([
      db
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .eq('team_id', game.team_id)
        .eq('is_active', true)
        .order('last_name'),
      db
        .from('game_notes')
        .select('overall_notes')
        .eq('game_id', params.gameId)
        .maybeSingle(),
      db
        .from('game_coach_notes')
        .select('coach_notes')
        .eq('game_id', params.gameId)
        .maybeSingle(),
      db
        .from('game_player_notes')
        .select('player_id, pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes')
        .eq('game_id', params.gameId),
    ]);

    const players = playersResult.data ?? [];
    const notes = notesResult.data;
    const playerNotesMap = Object.fromEntries(
      (playerNotesResult.data ?? []).map((row) => [row.player_id, row]),
    );

    return (
      <div className="p-8 max-w-4xl">
        {header}
        <GameNotesForm
          gameId={params.gameId}
          teamId={game.team_id}
          overallNotes={notes?.overall_notes ?? ''}
          coachNotes={coachNotesResult.data?.coach_notes ?? ''}
          players={players}
          playerNotesMap={playerNotesMap}
        />
      </div>
    );
  }

  // ── Player view ─────────────────────────────────────────────────────────────
  if (playerRecord) {
    const [notesResult, playerNotesResult] = await Promise.all([
      db
        .from('game_notes')
        .select('overall_notes')
        .eq('game_id', params.gameId)
        .maybeSingle(),
      db
        .from('game_player_notes')
        .select('pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes')
        .eq('game_id', params.gameId)
        .eq('player_id', playerRecord.id)
        .maybeSingle(),
    ]);

    return (
      <div className="p-8 max-w-2xl">
        {header}
        <PlayerGameView
          gameId={params.gameId}
          playerId={playerRecord.id}
          overallNotes={notesResult.data?.overall_notes ?? ''}
          coachNotes={playerNotesResult.data ?? null}
        />
      </div>
    );
  }

  // ── Parent view — one section per linked child ───────────────────────────────
  if (isParent && linkedPlayers.length > 0) {
    // Promise.all preserves insertion order, so childNotesResults[i] always
    // corresponds to linkedPlayers[i]. The subsequent .map uses the same index.
    const [notesResult, ...childNotesResults] = await Promise.all([
      db
        .from('game_notes')
        .select('overall_notes')
        .eq('game_id', params.gameId)
        .maybeSingle(),
      ...linkedPlayers.map((child) =>
        db
          .from('game_player_notes')
          .select('pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes')
          .eq('game_id', params.gameId)
          .eq('player_id', child.id)
          .maybeSingle(),
      ),
    ]);

    const overallNotes = notesResult.data?.overall_notes ?? '';

    return (
      <div className="p-8 max-w-2xl">
        {header}

        <div className="space-y-8">
          {/* Overall notes shown once at the top */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold text-gray-900">Overall Notes</h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                From the coach
              </span>
            </div>
            {overallNotes ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-xl px-4 py-3">
                {overallNotes}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic bg-white border border-gray-100 rounded-xl px-4 py-3">
                No overall notes posted yet.
              </p>
            )}
          </section>

          {/* One card per child */}
          {linkedPlayers.map((child, i) => (
            <PlayerGameView
              key={child.id}
              gameId={params.gameId}
              playerId={child.id}
              playerName={`${child.first_name} ${child.last_name}`}
              overallNotes={overallNotes}
              coachNotes={childNotesResults[i].data ?? null}
              readOnly
            />
          ))}
        </div>
      </div>
    );
  }

  // ── Fallback: team member with no player record ──────────────────────────────
  const { data: notes } = await db
    .from('game_notes')
    .select('overall_notes')
    .eq('game_id', params.gameId)
    .maybeSingle();

  return (
    <div className="p-8 max-w-2xl">
      {header}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Overall Notes</h2>
        {notes?.overall_notes ? (
          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white border border-gray-200 rounded-xl px-4 py-3">
            {notes.overall_notes}
          </p>
        ) : (
          <p className="text-sm text-gray-400 italic">No notes posted yet.</p>
        )}
      </section>
    </div>
  );
}
