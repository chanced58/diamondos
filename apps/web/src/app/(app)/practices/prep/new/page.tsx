import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Loose client alias for the loader helpers below — they do their own row
// typing via `as unknown as` rather than relying on the generated Database type.
type SupabaseUntyped = SupabaseClient;
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import {
  detectWeaknesses,
  deriveOpponentTendencies,
  generatePrepPractice,
  EventType,
  PracticeDrillDeficitPriority,
  WeaknessSeverity,
  type DerivedScoutingTag,
  type Game,
  type GameEvent,
  type HydratedWeaknessSignal,
  type OpponentPlayer,
  type PracticeDrill,
  type PracticeDrillDeficitTag,
  type WeaknessSignal,
} from '@baseball/shared';
import { getNextGameForTeam } from '@baseball/database';
import { PrepPreviewForm } from './PrepPreviewForm';

export const metadata: Metadata = { title: 'Prep for next game' };

interface PageProps {
  searchParams: Promise<{ duration?: string }>;
}

const DEFAULT_DURATION = 90;

export default async function PrepNewPage({ searchParams }: PageProps): Promise<JSX.Element | null> {
  const sp = await searchParams;
  const durationMinutes = sp?.duration ? Math.max(30, Math.min(180, parseInt(sp.duration, 10) || DEFAULT_DURATION)) : DEFAULT_DURATION;

  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) {
    return (
      <div className="p-8">
        <p className="text-gray-500">
          No team found.{' '}
          <Link href="/admin/create-team" className="text-brand-700 hover:underline">
            Create a team
          </Link>{' '}
          first.
        </p>
      </div>
    );
  }

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) {
    return <div className="p-8 text-gray-500">Only coaches can generate prep practices.</div>;
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const nextGame = await getNextGameForTeam(db as never, activeTeam.id);
  if (!nextGame) {
    return (
      <div className="p-8 max-w-xl">
        <Link href="/practices" className="text-sm text-brand-700 hover:underline">
          ← Back to practices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-2">No upcoming game</h1>
        <p className="text-gray-500 text-sm">
          Add a scheduled game from the Games screen first, then come back here to generate a prep practice.
        </p>
      </div>
    );
  }

  const [weaknesses, tendencies, drillsWithTags] = await Promise.all([
    loadRecentWeaknesses(db, activeTeam.id),
    loadOpponentTendencies(db, activeTeam.id, nextGame.opponentTeamId),
    loadDrillsAndTags(db, activeTeam.id),
  ]);

  const now = new Date();
  const scheduledAt = computeDefaultScheduledAt(nextGame.scheduledAt, now);

  const generation = generatePrepPractice({
    nextGame,
    opponentName: nextGame.opponentName,
    tendencies,
    weaknesses,
    drills: drillsWithTags.drills,
    drillDeficitTags: drillsWithTags.tagsByDrill,
    durationMinutes,
  });

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <Link href="/practices" className="text-sm text-brand-700 hover:underline">
          ← Back to practices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Prep for next game</h1>
        <p className="text-gray-500 text-sm mt-1">
          {activeTeam.name} vs{' '}
          <strong className="text-gray-900">{nextGame.opponentName}</strong> · {formatGameDate(nextGame.scheduledAt)}
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-amber-900 mb-1">Focus</h2>
        <p className="text-sm text-amber-900/90">{generation.focusSummary}</p>
        {generation.hasGaps && (
          <p className="mt-2 text-xs text-amber-800/80">
            Some target weaknesses have no matching drill in your library — tag drills with those deficits to improve future generations.
          </p>
        )}
      </div>

      <PrepPreviewForm
        teamId={activeTeam.id}
        linkedGameId={nextGame.id}
        scheduledAt={scheduledAt}
        durationMinutes={durationMinutes}
        focusSummary={generation.focusSummary}
        blocks={generation.blocks}
        drillsById={Object.fromEntries(drillsWithTags.drills.map((d) => [d.id, d.name]))}
        weaknessLabels={weaknesses.map((w) => w.label)}
        tendencyLabels={tendencies.map((t) => t.tagValue)}
      />
    </div>
  );
}

// ─── Server-side loaders ─────────────────────────────────────────────────────

async function loadRecentWeaknesses(
  db: SupabaseUntyped,
  teamId: string,
): Promise<HydratedWeaknessSignal[]> {
  // Look back 21 days for the most recent completed game; compute signals there.
  const twentyOneDaysAgo = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
  const { data: games } = await db
    .from('games')
    .select('id, completed_at')
    .eq('team_id', teamId)
    .eq('status', 'completed')
    .gt('completed_at', twentyOneDaysAgo)
    .order('completed_at', { ascending: false })
    .limit(1);

  const lastGame = ((games ?? []) as Array<{ id: string }>)[0];
  if (!lastGame) return [];

  const [{ data: events }, { data: playerRows }, { data: mapRows }] = await Promise.all([
    db.from('game_events').select('*').eq('game_id', lastGame.id).order('sequence_number'),
    db.from('players').select('id').eq('team_id', teamId),
    db.from('weakness_deficit_map').select('weakness_code, deficit_slug'),
  ]);

  const ourPlayerIds = new Set(((playerRows ?? []) as Array<{ id: string }>).map((p) => p.id));
  const rawEvents = (events ?? []) as Array<{
    id: string;
    game_id: string;
    sequence_number: number;
    event_type: string;
    inning: number;
    is_top_of_inning: boolean;
    payload: Record<string, unknown>;
    occurred_at: string;
    created_by: string;
    device_id: string;
  }>;
  const mappedEvents: GameEvent[] = rawEvents.map((r) => ({
    id: r.id,
    gameId: r.game_id,
    sequenceNumber: r.sequence_number,
    eventType: r.event_type as EventType,
    inning: r.inning,
    isTopOfInning: r.is_top_of_inning,
    payload: r.payload,
    occurredAt: r.occurred_at,
    createdBy: r.created_by,
    deviceId: r.device_id,
  }));

  const signals: WeaknessSignal[] = detectWeaknesses(mappedEvents, { ourPlayerIds });

  // Hydrate deficit slugs → ids.
  const slugsByCode = groupSlugs((mapRows ?? []) as Array<{ weakness_code: string; deficit_slug: string }>);
  const needed = new Set<string>();
  for (const s of signals) for (const slug of slugsByCode.get(s.code) ?? []) needed.add(slug);
  if (needed.size === 0) return signals.map((s) => ({ ...s, suggestedDeficitIds: [] }));

  const { data: deficitRows } = await db
    .from('practice_deficits')
    .select('id, slug')
    .eq('visibility', 'system')
    .in('slug', Array.from(needed));
  const idBySlug = new Map(
    ((deficitRows ?? []) as Array<{ id: string; slug: string }>).map((r) => [r.slug, r.id]),
  );

  return signals.map((s) => {
    const slugs = slugsByCode.get(s.code) ?? [];
    const ids = slugs.map((slug) => idBySlug.get(slug)).filter((id): id is string => Boolean(id));
    return { ...s, suggestedDeficitSlugs: slugs, suggestedDeficitIds: ids };
  });
}

async function loadOpponentTendencies(
  db: SupabaseUntyped,
  teamId: string,
  opponentTeamId?: string,
): Promise<DerivedScoutingTag[]> {
  if (!opponentTeamId) return [];

  const [{ data: pastGames }, { data: oppPlayers }] = await Promise.all([
    db.from('games').select('id').eq('team_id', teamId).eq('opponent_team_id', opponentTeamId),
    db.from('opponent_players').select('*').eq('opponent_team_id', opponentTeamId),
  ]);

  const gameIds = ((pastGames ?? []) as Array<{ id: string }>).map((g) => g.id);
  let mappedEvents: GameEvent[] = [];
  if (gameIds.length > 0) {
    const { data: events } = await db
      .from('game_events')
      .select('*')
      .in('game_id', gameIds);
    const raw = (events ?? []) as Array<{
      id: string;
      game_id: string;
      sequence_number: number;
      event_type: string;
      inning: number;
      is_top_of_inning: boolean;
      payload: Record<string, unknown>;
      occurred_at: string;
      created_by: string;
      device_id: string;
    }>;
    mappedEvents = raw.map((r) => ({
      id: r.id,
      gameId: r.game_id,
      sequenceNumber: r.sequence_number,
      eventType: r.event_type as EventType,
      inning: r.inning,
      isTopOfInning: r.is_top_of_inning,
      payload: r.payload,
      occurredAt: r.occurred_at,
      createdBy: r.created_by,
      deviceId: r.device_id,
    }));
  }

  const rawPlayers = (oppPlayers ?? []) as Array<{
    id: string;
    opponent_team_id: string;
    first_name: string;
    last_name: string;
    primary_position: string | null;
    bats: string | null;
    throws: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
  const players: OpponentPlayer[] = rawPlayers.map((r) => ({
    id: r.id,
    opponentTeamId: r.opponent_team_id,
    firstName: r.first_name,
    lastName: r.last_name,
    primaryPosition: (r.primary_position ?? undefined) as OpponentPlayer['primaryPosition'],
    bats: (r.bats ?? undefined) as OpponentPlayer['bats'],
    throws: (r.throws ?? undefined) as OpponentPlayer['throws'],
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return deriveOpponentTendencies(mappedEvents, players);
}

async function loadDrillsAndTags(
  db: SupabaseUntyped,
  teamId: string,
): Promise<{ drills: PracticeDrill[]; tagsByDrill: Map<string, PracticeDrillDeficitTag[]> }> {
  const [{ data: drillRows }, { data: tagRows }] = await Promise.all([
    db.from('practice_drills').select('*').or(`team_id.is.null,team_id.eq.${teamId}`),
    db.from('practice_drill_deficit_tags').select('*').or(`team_id.is.null,team_id.eq.${teamId}`),
  ]);
  const drills = ((drillRows ?? []) as Array<Record<string, unknown>>).map(mapDrillRow);
  const tagsByDrill = new Map<string, PracticeDrillDeficitTag[]>();
  for (const r of (tagRows ?? []) as Array<{
    id: string;
    drill_id: string;
    deficit_id: string;
    team_id: string | null;
    priority: string;
    created_by: string | null;
    created_at: string;
  }>) {
    const tag: PracticeDrillDeficitTag = {
      id: r.id,
      drillId: r.drill_id,
      deficitId: r.deficit_id,
      teamId: r.team_id,
      priority: r.priority as PracticeDrillDeficitPriority,
      createdBy: r.created_by ?? undefined,
      createdAt: r.created_at,
    };
    const list = tagsByDrill.get(tag.drillId);
    if (list) list.push(tag);
    else tagsByDrill.set(tag.drillId, [tag]);
  }
  return { drills, tagsByDrill };
}

function mapDrillRow(r: Record<string, unknown>): PracticeDrill {
  return {
    id: r.id as string,
    teamId: (r.team_id as string | null) ?? null,
    visibility: r.visibility as PracticeDrill['visibility'],
    name: r.name as string,
    description: (r.description as string | null) ?? undefined,
    defaultDurationMinutes: (r.default_duration_minutes as number | null) ?? undefined,
    skillCategories: (r.skill_categories as PracticeDrill['skillCategories']) ?? [],
    positions: (r.positions as string[]) ?? [],
    ageLevels: (r.age_levels as PracticeDrill['ageLevels']) ?? [],
    equipment: (r.equipment as PracticeDrill['equipment']) ?? [],
    fieldSpaces: (r.field_spaces as PracticeDrill['fieldSpaces']) ?? [],
    minPlayers: (r.min_players as number | null) ?? undefined,
    maxPlayers: (r.max_players as number | null) ?? undefined,
    coachingPoints: (r.coaching_points as string | null) ?? undefined,
    tags: (r.tags as string[]) ?? [],
    diagramUrl: (r.diagram_url as string | null) ?? undefined,
    videoUrl: (r.video_url as string | null) ?? undefined,
    source: (r.source as string | null) ?? undefined,
    createdBy: (r.created_by as string | null) ?? undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function groupSlugs(rows: Array<{ weakness_code: string; deficit_slug: string }>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.weakness_code);
    if (list) list.push(r.deficit_slug);
    else map.set(r.weakness_code, [r.deficit_slug]);
  }
  return map;
}

/**
 * Default the practice to 48 hours before the next game, but snap to 10am if
 * that falls at an odd time or is already past.
 */
function computeDefaultScheduledAt(gameIso: string, now: Date): string {
  const gameDate = new Date(gameIso);
  const target = new Date(gameDate.getTime() - 2 * 24 * 3600 * 1000);
  target.setHours(15, 0, 0, 0); // 3pm local
  if (target.getTime() < now.getTime()) {
    // Past — schedule for tomorrow 3pm.
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(15, 0, 0, 0);
    return tomorrow.toISOString();
  }
  return target.toISOString();
}

function formatGameDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export { WeaknessSeverity }; // re-export keeps the type package in graph