import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { VolumeByFocusChart } from './VolumeByFocusChart';

export const metadata: Metadata = { title: 'Practice Volume' };

export default async function PracticeVolumePage({
  searchParams,
}: {
  searchParams: { season?: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: allSeasons } = await db
    .from('seasons')
    .select('id, name, start_date, end_date, is_active')
    .eq('team_id', activeTeam.id)
    .order('start_date', { ascending: false });

  const seasons = allSeasons ?? [];
  const activeSeason = seasons.find((s) => s.is_active) ?? null;
  const selectedSeason = searchParams.season
    ? seasons.find((s) => s.id === searchParams.season) ?? null
    : activeSeason;

  // Pull the focus catalog (system + team), and the full volume rollup for this team.
  const [catalogResult, volumeResult] = await Promise.all([
    db
      .from('drill_focus_catalog')
      .select('slug, name, description, visibility, team_id, sort_order')
      .or(`visibility.eq.system,team_id.eq.${activeTeam.id}`)
      .order('sort_order'),
    db
      .from('v_practice_volume_by_focus')
      .select('focus_slug, total_planned_minutes, total_actual_minutes, session_count, last_worked_at, first_worked_at')
      .eq('team_id', activeTeam.id),
  ]);

  const catalog = catalogResult.data ?? [];
  const allVolume = volumeResult.data ?? [];

  // If we have a season-bounded window, filter the rollup client-side by
  // last_worked_at. A more precise per-practice filter requires a separate
  // query; for MVP, whole-range filter is sufficient to distinguish seasons.
  const seasonStart = selectedSeason?.start_date ?? null;
  const seasonEndRaw = selectedSeason?.end_date ?? null;
  const seasonEnd = seasonEndRaw ?? new Date().toISOString().slice(0, 10);

  // Proper per-season filter: re-query practice_blocks joined to focus tags,
  // bounded by scheduled_at. This keeps "zero-minute" focuses accurate.
  type SeasonVolumeRow = {
    focus_slug: string;
    planned: number;
    actual: number;
    sessions: number;
    last_worked_at: string | null;
  };
  let seasonVolume: SeasonVolumeRow[] = [];

  if (seasonStart) {
    const { data: blockRows } = await db
      .from('practice_blocks')
      .select(`
        planned_duration_minutes,
        actual_duration_minutes,
        practice_id,
        practices!inner(team_id, scheduled_at),
        practice_drill_focus_tags:practice_drill_focus_tags!practice_drill_focus_tags_drill_id_fkey(focus_slug)
      `)
      .eq('practices.team_id', activeTeam.id)
      .gte('practices.scheduled_at', `${seasonStart}T00:00:00Z`)
      .lte('practices.scheduled_at', `${seasonEnd}T23:59:59Z`);

    const agg = new Map<string, SeasonVolumeRow>();
    // Dedupe sessions per focus_slug: one block-per-focus shouldn't be counted
    // as N sessions when two blocks in the same practice share a focus.
    const seenPracticesByFocus = new Map<string, Set<string>>();
    for (const row of (blockRows ?? []) as unknown as Array<{
      planned_duration_minutes: number | null;
      actual_duration_minutes: number | null;
      practice_id: string;
      practices: { scheduled_at: string } | { scheduled_at: string }[];
      practice_drill_focus_tags: Array<{ focus_slug: string }>;
    }>) {
      const practice = Array.isArray(row.practices) ? row.practices[0] : row.practices;
      if (!practice) continue;
      for (const tag of row.practice_drill_focus_tags ?? []) {
        const existing = agg.get(tag.focus_slug) ?? {
          focus_slug: tag.focus_slug,
          planned: 0,
          actual: 0,
          sessions: 0,
          last_worked_at: null,
        };
        existing.planned += row.planned_duration_minutes ?? 0;
        existing.actual += row.actual_duration_minutes ?? 0;

        const seen = seenPracticesByFocus.get(tag.focus_slug) ?? new Set<string>();
        if (!seen.has(row.practice_id)) {
          seen.add(row.practice_id);
          existing.sessions += 1;
          seenPracticesByFocus.set(tag.focus_slug, seen);
        }

        if (!existing.last_worked_at || practice.scheduled_at > existing.last_worked_at) {
          existing.last_worked_at = practice.scheduled_at;
        }
        agg.set(tag.focus_slug, existing);
      }
    }
    seasonVolume = Array.from(agg.values());
  } else {
    seasonVolume = allVolume.map((v) => ({
      focus_slug: v.focus_slug as string,
      planned: (v.total_planned_minutes as number) ?? 0,
      actual: (v.total_actual_minutes as number) ?? 0,
      sessions: (v.session_count as number) ?? 0,
      last_worked_at: (v.last_worked_at as string | null) ?? null,
    }));
  }

  // Merge with catalog so seeded focuses with zero minutes still appear
  // (coaches want to see absence, not just what's been worked).
  const volumeBySlug = new Map(seasonVolume.map((v) => [v.focus_slug, v]));
  const rows = catalog.map((c) => {
    const v = volumeBySlug.get(c.slug);
    return {
      slug: c.slug,
      name: c.name,
      description: c.description,
      visibility: c.visibility as 'system' | 'team',
      planned: v?.planned ?? 0,
      actual: v?.actual ?? 0,
      sessions: v?.sessions ?? 0,
      lastWorkedAt: v?.last_worked_at ?? null,
    };
  });

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Practice volume by focus</h1>
        <p className="text-gray-500 text-sm mt-1">
          Minutes your team has spent on each focus. Zero-minute rows are the blind spots.
        </p>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-medium text-gray-600">Season:</span>
        <div className="flex flex-wrap gap-1">
          <Link
            href="/analytics/practice-volume"
            className={`px-3 py-1 text-xs rounded-md border ${
              !selectedSeason ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            All time
          </Link>
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/analytics/practice-volume?season=${s.id}`}
              className={`px-3 py-1 text-xs rounded-md border ${
                selectedSeason?.id === s.id
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {s.name}
              {s.is_active && ' (active)'}
            </Link>
          ))}
        </div>
      </div>

      <VolumeByFocusChart rows={rows} />
    </div>
  );
}
