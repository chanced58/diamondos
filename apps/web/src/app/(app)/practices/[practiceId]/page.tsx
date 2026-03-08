import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { formatDate, formatTime } from '@baseball/shared';
import { PracticeNotesForm } from './PracticeNotesForm';
import { PlayerPracticeView } from './PlayerPracticeView';
import { CancelPracticeForm } from './CancelPracticeForm';
import { PracticePlanEditor } from './PracticePlanEditor';
import { LocationMap } from '@/components/maps/LocationMap';

export const metadata: Metadata = { title: 'Practice Notes' };

export default async function PracticeNotesPage({
  params,
}: {
  params: { practiceId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: practice } = await db
    .from('practices')
    .select('*')
    .eq('id', params.practiceId)
    .single();

  if (!practice) notFound();

  // Determine role + linked player record in parallel
  const [membershipResult, playerResult, linkedPlayersResult, access] = await Promise.all([
    db
      .from('team_members')
      .select('role')
      .eq('team_id', practice.team_id)
      .eq('user_id', user.id)
      .single(),
    // Player linked directly to this user on this team
    db
      .from('players')
      .select('id, first_name, last_name')
      .eq('team_id', practice.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
    // Players linked via parent_player_links
    db
      .from('parent_player_links')
      .select('player_id, players(id, first_name, last_name, team_id)')
      .eq('parent_user_id', user.id),
    getUserAccess(practice.team_id, user.id),
  ]);

  const role = membershipResult.data?.role;
  const isCoach = access.isCoach;
  const isParent = role === 'parent';
  const playerRecord = playerResult.data;

  // Filter linked players to only those on this team
  const linkedPlayers = (linkedPlayersResult.data ?? [])
    .map((link) => {
      const raw = link.players as unknown;
      return (Array.isArray(raw) ? raw[0] : raw) as { id: string; first_name: string; last_name: string; team_id: string } | null;
    })
    .filter((p): p is { id: string; first_name: string; last_name: string; team_id: string } =>
      p !== null && p.team_id === practice.team_id,
    );

  const header = (
    <div className="mb-8">
      <Link href="/practices" className="text-sm text-brand-700 hover:underline">
        ← Back to practices
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">
        Practice — {formatDate(practice.scheduled_at)}
      </h1>
      <p className="text-gray-500 text-sm mt-0.5">
        {formatTime(practice.scheduled_at)}
        {practice.duration_minutes && ` · ${practice.duration_minutes} min`}
        {practice.location && ` · ${practice.location}`}
      </p>
      {practice.latitude && practice.longitude && (
        <div className="mt-4">
          <LocationMap
            latitude={practice.latitude}
            longitude={practice.longitude}
            label={practice.location ?? 'Practice location'}
            placeId={practice.place_id ?? undefined}
          />
        </div>
      )}
    </div>
  );

  // ── Coach view ──────────────────────────────────────────────────────────────
  if (isCoach) {
    const [playersResult, notesResult, playerNotesResult] = await Promise.all([
      db
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .eq('team_id', practice.team_id)
        .eq('is_active', true)
        .order('last_name'),
      db
        .from('practice_notes')
        .select('overall_notes, coach_notes')
        .eq('practice_id', params.practiceId)
        .maybeSingle(),
      db
        .from('practice_player_notes')
        .select('player_id, pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes')
        .eq('practice_id', params.practiceId),
    ]);

    const players = playersResult.data ?? [];
    const notes = notesResult.data;
    const playerNotesMap = Object.fromEntries(
      (playerNotesResult.data ?? []).map((row) => [row.player_id, row]),
    );

    return (
      <div className="p-8 max-w-4xl">
        {header}
        <PracticePlanEditor
          practiceId={params.practiceId}
          initialPlan={practice.plan ?? ''}
        />
        <PracticeNotesForm
          practiceId={params.practiceId}
          teamId={practice.team_id}
          overallNotes={notes?.overall_notes ?? ''}
          coachNotes={notes?.coach_notes ?? ''}
          players={players}
          playerNotesMap={playerNotesMap}
        />

        {/* ── Cancel practice (coaches only) ──────────────────────────── */}
        {practice.status !== 'cancelled' && (
          <div className="mt-10 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Danger Zone</p>
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-900">Cancel practice</p>
                <p className="text-xs text-red-600 mt-0.5">
                  This will remove the practice from the schedule.
                </p>
              </div>
              <CancelPracticeForm practiceId={params.practiceId} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Player view ─────────────────────────────────────────────────────────────
  if (playerRecord) {
    const [notesResult, playerNotesResult] = await Promise.all([
      db
        .from('practice_notes')
        .select('overall_notes')
        .eq('practice_id', params.practiceId)
        .maybeSingle(),
      db
        .from('practice_player_notes')
        .select('pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes')
        .eq('practice_id', params.practiceId)
        .eq('player_id', playerRecord.id)
        .maybeSingle(),
    ]);

    return (
      <div className="p-8 max-w-2xl">
        {header}
        {practice.plan && (
          <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-blue-800 mb-2">Practice Plan</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{practice.plan}</p>
          </div>
        )}
        <PlayerPracticeView
          practiceId={params.practiceId}
          playerId={playerRecord.id}
          overallNotes={notesResult.data?.overall_notes ?? ''}
          coachNotes={playerNotesResult.data ?? null}
        />
      </div>
    );
  }

  // ── Parent view — one section per linked child ───────────────────────────────
  if (isParent && linkedPlayers.length > 0) {
    // Load overall notes + each child's notes
    const [notesResult, ...childNotesResults] = await Promise.all([
      db
        .from('practice_notes')
        .select('overall_notes')
        .eq('practice_id', params.practiceId)
        .maybeSingle(),
      ...linkedPlayers.map((child) =>
        db
          .from('practice_player_notes')
          .select('pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes')
          .eq('practice_id', params.practiceId)
          .eq('player_id', child.id)
          .maybeSingle(),
      ),
    ]);

    const overallNotes = notesResult.data?.overall_notes ?? '';

    return (
      <div className="p-8 max-w-2xl">
        {header}

        <div className="space-y-8">
          {/* Practice plan shown once at the top if set */}
          {practice.plan && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-blue-800 mb-2">Practice Plan</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{practice.plan}</p>
            </div>
          )}

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
            <PlayerPracticeView
              key={child.id}
              practiceId={params.practiceId}
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

  // ── Fallback: team member with no player record and no linked children ───────
  const { data: notes } = await db
    .from('practice_notes')
    .select('overall_notes')
    .eq('practice_id', params.practiceId)
    .maybeSingle();

  return (
    <div className="p-8 max-w-2xl">
      {header}
      {practice.plan && (
        <div className="mb-8 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-800 mb-2">Practice Plan</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{practice.plan}</p>
        </div>
      )}
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
