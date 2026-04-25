import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import {
  POSITION_ABBREVIATIONS,
  formatDate,
  derivePitchingStats,
  filterResetAndReverted,
  formatInningsPitched,
  formatAverage,
  deriveBattingStats,
  formatBattingRate,
  formatBattingPct,
} from '@baseball/shared';
import type { PitchingStats, BattingStats } from '@baseball/shared';
import { EditPlayerForm, DeactivatePlayerForm, ReactivatePlayerForm } from './EditPlayerForm';
import { DrillRecommendations } from './DrillRecommendations';
import { RELEVANT_EVENT_TYPES } from '../../../../compliance/constants';
import { buildLineupsByGameId } from '@/lib/stats/lineups';
import { fetchAllEventsForGames } from '@/lib/stats/fetch-events';

export const metadata: Metadata = { title: 'Player Profile' };

const CATEGORIES = [
  { key: 'pitching',          label: 'Pitching' },
  { key: 'hitting',           label: 'Hitting' },
  { key: 'fielding_catching', label: 'Fielding / Catching' },
  { key: 'baserunning',       label: 'Baserunning' },
  { key: 'athleticism',       label: 'Athleticism' },
  { key: 'attitude',          label: 'Attitude' },
  { key: 'player_notes',      label: 'Player Self-Reflection' },
] as const;

type CategoryKey = typeof CATEGORIES[number]['key'];

export default async function PlayerPage({
  params,
}: {
  params: { teamId: string; playerId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [playerResult, notesResult, access] = await Promise.all([
    db
      .from('players')
      .select('*')
      .eq('id', params.playerId)
      .eq('team_id', params.teamId)
      .single(),
    // Fetch all practice notes for this player, newest first
    db
      .from('practice_player_notes')
      .select(`
        practice_id,
        pitching, hitting, fielding_catching, baserunning,
        athleticism, attitude, player_notes,
        practices(id, scheduled_at)
      `)
      .eq('player_id', params.playerId)
      .order('created_at', { ascending: false }),
    getUserAccess(params.teamId, user.id),
  ]);

  if (!playerResult.data) notFound();
  const player = playerResult.data;

  const isCoach = access.isCoach;

  // If this player row has been claimed by a Pro user, link to their public profile
  let claimedProfile: { handle: string; isPublic: boolean } | null = null;
  if (player.user_id) {
    const { data: pp } = await db
      .from('player_profiles')
      .select('handle, is_public')
      .eq('user_id', player.user_id)
      .maybeSingle();
    if (pp) claimedProfile = { handle: pp.handle, isPublic: pp.is_public };
  }

  // Build a per-category list of { date, text, practiceId } entries
  type NoteEntry = { date: string; text: string; practiceId: string };
  const categoryNotes: Record<CategoryKey, NoteEntry[]> = {
    pitching: [], hitting: [], fielding_catching: [],
    baserunning: [], athleticism: [], attitude: [], player_notes: [],
  };

  for (const row of notesResult.data ?? []) {
    const rawPractice = row.practices as unknown;
    const practice = (Array.isArray(rawPractice) ? rawPractice[0] : rawPractice) as { id: string; scheduled_at: string } | null;
    if (!practice) continue;
    for (const { key } of CATEGORIES) {
      const text = row[key as keyof typeof row] as string | null;
      if (text) {
        categoryNotes[key].push({
          date: practice.scheduled_at,
          text,
          practiceId: practice.id,
        });
      }
    }
  }

  // ── Season stats for this player (pitching + batting) ────────────────────
  // Falls back to "all games" when no active season exists so coaches with
  // rolling-roster setups still see player stats.
  let pitchingStats: PitchingStats | null = null;
  let battingStats: BattingStats | null = null;
  {
    const { data: season } = await db
      .from('seasons')
      .select('id')
      .eq('team_id', params.teamId)
      .eq('is_active', true)
      .maybeSingle();

    let gamesQuery = db
      .from('games')
      .select('id, location_type, neutral_home_team')
      .eq('team_id', params.teamId)
      .in('status', ['completed', 'in_progress']);
    if (season) gamesQuery = gamesQuery.eq('season_id', season.id);
    const { data: games } = await gamesQuery;

    const gameIds = (games ?? []).map((g) => g.id);

    if (gameIds.length > 0) {
      // Paginated to avoid Supabase's default 1000-row PostgREST cutoff
      // silently truncating long seasons.
      const events = await fetchAllEventsForGames(
        db,
        gameIds,
        RELEVANT_EVENT_TYPES as unknown as readonly string[],
      );

      if (events.length > 0) {
        // Strip reverted/reset events so they don't leak into totals.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filteredEvents: any[] = filterResetAndReverted(events) as any[];

        // Build per-game lineup context for stub-batter recovery during our
        // team's half-inning. Pulls the full team roster (not just this
        // player) so the lineup covers every batting slot. Best-effort.
        const lineupsByGameId = await buildLineupsByGameId(db, (games ?? []).map((g) => ({
          id: g.id,
          location_type: g.location_type as string,
          neutral_home_team: g.neutral_home_team as string | null,
        })));

        const playerEntry = [
          { id: player.id, firstName: player.first_name, lastName: player.last_name },
        ];

        const pitchingMap = derivePitchingStats(filteredEvents, playerEntry);
        pitchingStats = pitchingMap.get(player.id) ?? null;

        const battingMap = deriveBattingStats(filteredEvents, playerEntry, lineupsByGameId);
        const bStats = battingMap.get(player.id) ?? null;
        battingStats = bStats && bStats.plateAppearances > 0 ? bStats : null;
      }
    }
  }

  const totalPractices = new Set((notesResult.data ?? []).map((r) => r.practice_id)).size;
  const positionLabel = player.primary_position
    ? `${POSITION_ABBREVIATIONS[player.primary_position]} — ${player.primary_position.replace(/_/g, ' ')}`
    : null;
  const secondaryPositions: string[] = player.secondary_positions ?? [];
  const batsThrows =
    player.bats && player.throws
      ? `${player.bats.charAt(0).toUpperCase()}/${player.throws.charAt(0).toUpperCase()}`
      : null;

  // Only show categories that have at least one entry
  const populatedCategories = CATEGORIES.filter(({ key }) => categoryNotes[key].length > 0);

  return (
    <div className="p-8 max-w-2xl">
      {/* ── Back link ─────────────────────────────────────────────────── */}
      <Link href={`/teams/${params.teamId}/roster`} className="text-sm text-brand-700 hover:underline">
        ← Back to roster
      </Link>

      {/* ── Profile header ────────────────────────────────────────────── */}
      <div className="mt-4 mb-8 flex items-start gap-5">
        <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-2xl font-bold shrink-0">
          {player.first_name[0]}{player.last_name[0]}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
            {player.first_name} {player.last_name}
            {player.jersey_number != null && (
              <span className="text-lg font-mono text-gray-400">#{player.jersey_number}</span>
            )}
            {claimedProfile && claimedProfile.isPublic ? (
              <Link
                href={`/p/${claimedProfile.handle}`}
                className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full hover:bg-amber-100"
                title="This player has a public Pro recruiting profile"
              >
                🎖️ Pro profile →
              </Link>
            ) : claimedProfile ? (
              <span
                className="text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full"
                title="This player has a Pro profile (currently private)"
              >
                🎖️ Pro profile
              </span>
            ) : null}
          </h1>
          {positionLabel && (
            <span className="inline-block mt-1 text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200 px-2.5 py-0.5 rounded-full capitalize">
              {positionLabel}
            </span>
          )}
          {secondaryPositions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {secondaryPositions.map((pos) => (
                <span
                  key={pos}
                  className="text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full capitalize"
                >
                  {POSITION_ABBREVIATIONS[pos] ?? pos}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Disabled banner ─────────────────────────────────────────────── */}
      {!player.is_active && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-900">This player is disabled</p>
              <p className="text-xs text-yellow-700 mt-0.5">
                Stats and history are preserved.
                {player.disabled_at && (
                  <> Disabled on {new Date(player.disabled_at).toLocaleDateString()}.</>
                )}
              </p>
            </div>
            {isCoach && (
              <ReactivatePlayerForm player={player} teamId={params.teamId} />
            )}
          </div>
        </div>
      )}

      {/* ── Quick stats ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Bats / Throws</p>
          <p className="text-lg font-bold text-gray-900">{batsThrows ?? '—'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Grad Year</p>
          <p className="text-lg font-bold text-gray-900">{player.graduation_year ?? '—'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-400 mb-1">Practices</p>
          <p className="text-lg font-bold text-gray-900">{totalPractices}</p>
        </div>
      </div>

      {/* ── Contact info ──────────────────────────────────────────────── */}
      {(player.email || player.phone) && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-8 flex flex-wrap gap-6">
          {player.email && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Email</p>
              <a href={`mailto:${player.email}`} className="text-sm text-brand-700 hover:underline">
                {player.email}
              </a>
            </div>
          )}
          {player.phone && (
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Phone</p>
              <a href={`tel:${player.phone}`} className="text-sm text-gray-900 hover:underline">
                {player.phone}
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Pitching stats (current season) ───────────────────────────── */}
      {pitchingStats && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Pitching Stats — This Season</h2>
            <Link href="/compliance" className="text-xs text-brand-700 hover:underline">
              View all pitchers →
            </Link>
          </div>

          {/* Top-line stats grid */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'BF',    value: pitchingStats.totalPAs.toString() },
              { label: 'IP',    value: formatInningsPitched(pitchingStats.inningsPitchedOuts) },
              { label: 'ERA',   value: isFinite(pitchingStats.era) ? pitchingStats.era.toFixed(2) : '---' },
              { label: 'WHIP',  value: isFinite(pitchingStats.whip) ? pitchingStats.whip.toFixed(2) : '---' },
              { label: 'PC',    value: pitchingStats.totalPitches.toString() },
              { label: 'K',     value: pitchingStats.strikeouts.toString() },
              { label: 'BB',    value: pitchingStats.walksAllowed.toString() },
              { label: 'H',     value: pitchingStats.hitsAllowed.toString() },
              { label: 'HBP',   value: pitchingStats.hitBatters.toString() },
              { label: 'R',     value: pitchingStats.runsAllowed.toString() },
              { label: 'ER',    value: pitchingStats.earnedRunsAllowed.toString() },
              { label: 'WP',    value: pitchingStats.wildPitches.toString() },
              { label: 'STR%',  value: `${(pitchingStats.strikePercentage * 100).toFixed(1)}%` },
              { label: 'FPS%',  value: `${(pitchingStats.firstPitchStrikePercentage * 100).toFixed(1)}%` },
              { label: '3B%',   value: `${(pitchingStats.threeBallCountPercentage * 100).toFixed(1)}%` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
                <p className="text-base font-bold text-gray-900 tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* BA by count grid */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              BA Against by Count
            </p>
            <div className="inline-block">
              {/* Header */}
              <div className="flex">
                <div className="w-16" />
                {[0, 1, 2].map((s) => (
                  <div key={s} className="w-16 text-center text-xs font-semibold text-gray-500 pb-1">
                    {s} str
                  </div>
                ))}
              </div>
              {/* Rows */}
              {[0, 1, 2, 3].map((b) => (
                <div key={b} className="flex items-center mb-1">
                  <div className="w-16 text-xs font-semibold text-gray-500 pr-2 text-right">
                    {b} {b === 1 ? 'ball' : 'balls'}
                  </div>
                  {[0, 1, 2].map((s) => {
                    const key = `${b}-${s}`;
                    const cs = pitchingStats!.baByCount[key];
                    const avg = cs ? formatAverage(cs.average) : '---';
                    const hasData = cs && cs.atBats > 0;
                    return (
                      <div
                        key={s}
                        className={`w-16 h-10 flex flex-col items-center justify-center rounded text-xs border mx-0.5 ${
                          hasData
                            ? 'bg-white border-gray-200 text-gray-900 font-mono'
                            : 'bg-gray-50 border-gray-100 text-gray-400'
                        }`}
                        title={hasData ? `${cs!.hits}-for-${cs!.atBats}` : 'No data'}
                      >
                        <span className="font-semibold">{avg}</span>
                        {hasData && (
                          <span className="text-gray-400 text-[10px]">
                            {cs!.hits}/{cs!.atBats}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Hitting stats (current season) ────────────────────────────── */}
      {battingStats && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">Hitting Stats — This Season</h2>
            <Link href="/compliance?tab=hitting" className="text-xs text-brand-700 hover:underline">
              View all hitters →
            </Link>
          </div>

          {/* Key rate stats grid */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'AVG',  value: formatBattingRate(battingStats.avg) },
              { label: 'OBP',  value: formatBattingRate(battingStats.obp) },
              { label: 'SLG',  value: formatBattingRate(battingStats.slg) },
              { label: 'OPS',  value: formatBattingRate(battingStats.ops) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {/* Counting + advanced stats grid */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'G',     value: battingStats.gamesAppeared.toString() },
              { label: 'PA',    value: battingStats.plateAppearances.toString() },
              { label: 'AB',    value: battingStats.atBats.toString() },
              { label: 'R',     value: battingStats.runs.toString() },
              { label: 'H',     value: battingStats.hits.toString() },
              { label: '2B',    value: battingStats.doubles.toString() },
              { label: '3B',    value: battingStats.triples.toString() },
              { label: 'HR',    value: battingStats.homeRuns.toString() },
              { label: 'RBI',   value: battingStats.rbi.toString() },
              { label: 'BB',    value: battingStats.walks.toString() },
              { label: 'K',     value: battingStats.strikeouts.toString() },
              { label: 'HBP',   value: battingStats.hitByPitch.toString() },
              { label: 'ISO',   value: formatBattingRate(battingStats.iso) },
              { label: 'BABIP', value: formatBattingRate(battingStats.babip) },
              { label: 'K%',    value: formatBattingPct(battingStats.kPct) },
              { label: 'BB%',   value: formatBattingPct(battingStats.bbPct) },
              { label: 'wOBA',  value: formatBattingRate(battingStats.woba) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
                <p className="text-base font-bold text-gray-900 tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Tier 7 F4 — AI drill recommendations (coaches only) ────────── */}
      {isCoach && player.is_active && (
        <DrillRecommendations teamId={params.teamId} playerId={params.playerId} />
      )}

      {/* ── Per-category note history ──────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Development Notes</h2>

        {populatedCategories.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl px-5 py-8 text-center text-gray-400 text-sm">
            No practice notes recorded yet.
            <br />
            <Link href="/practices" className="text-brand-700 hover:underline mt-1 inline-block text-xs">
              Go to Practices →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {populatedCategories.map(({ key, label }) => (
              <div key={key} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Category header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
                  <span className="text-xs text-gray-400">
                    {categoryNotes[key].length} {categoryNotes[key].length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                {/* Scrollable entry list */}
                <ul className="divide-y divide-gray-100 max-h-56 overflow-y-auto">
                  {categoryNotes[key].map((entry, i) => (
                    <li key={i} className="flex gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                      <div className="shrink-0 pt-0.5">
                        <Link
                          href={`/practices/${entry.practiceId}`}
                          className="text-xs font-medium text-brand-700 hover:underline whitespace-nowrap"
                        >
                          {formatDate(entry.date)}
                        </Link>
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">{entry.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Availability & compliance (coaches only) ──────────────────── */}
      {isCoach && (
        <section className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Link
            href={`/teams/${params.teamId}/roster/${params.playerId}/availability`}
            className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-semibold text-gray-900">Availability</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Injury flags that suppress contraindicated drills.
              </p>
            </div>
            <span className="text-gray-400 text-sm">Open →</span>
          </Link>
          <Link
            href={`/teams/${params.teamId}/roster/${params.playerId}/documents`}
            className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-5 py-4 hover:bg-gray-50 transition-colors"
          >
            <div>
              <p className="font-semibold text-gray-900">Documents</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Liability waivers, medical releases, and other compliance paperwork.
              </p>
            </div>
            <span className="text-gray-400 text-sm">Open →</span>
          </Link>
        </section>
      )}

      {/* ── Edit player info (coaches only, active players) ────────────── */}
      {isCoach && player.is_active && (
        <section>
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer select-none bg-white border border-gray-200 rounded-xl px-5 py-4 hover:bg-gray-50 transition-colors">
              <span className="font-semibold text-gray-900">Edit Player Info</span>
              <span className="text-gray-400 text-sm group-open:hidden">Expand</span>
              <span className="text-gray-400 text-sm hidden group-open:inline">Collapse</span>
            </summary>
            <div className="border border-t-0 border-gray-200 rounded-b-xl px-5 py-5">
              <EditPlayerForm player={player} teamId={params.teamId} />
            </div>
          </details>

          {/* ── Danger zone ──────────────────────────────────────────── */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Danger Zone</p>
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-900">Remove from roster</p>
                <p className="text-xs text-red-600 mt-0.5">
                  The player will be deactivated. Their history is preserved.
                </p>
              </div>
              <DeactivatePlayerForm player={player} teamId={params.teamId} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
