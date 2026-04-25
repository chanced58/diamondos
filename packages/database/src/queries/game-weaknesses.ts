import {
  applyPitchRevertedTyped,
  detectWeaknesses,
  EventType,
  type GameEvent,
  type HydratedWeaknessSignal,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

/**
 * Computes last-game weakness signals for a specific game and hydrates each
 * signal's suggested deficit slugs into concrete deficit ids via the
 * weakness_deficit_map + practice_deficits tables.
 *
 * Returns an empty array when no events are present or no weakness trips.
 * Throws on any RLS/query error so callers can surface a clear message.
 */
export async function getGameWeaknesses(
  supabase: TypedSupabaseClient,
  gameId: string,
  teamId: string,
): Promise<HydratedWeaknessSignal[]> {
  const [{ data: eventRows, error: eventsErr }, { data: playerRows, error: playersErr }] = await Promise.all([
    supabase
      .from('game_events')
      .select('*')
      .eq('game_id', gameId)
      .order('sequence_number', { ascending: true }),
    supabase
      .from('players')
      .select('id')
      .eq('team_id', teamId),
  ]);
  if (eventsErr) throw eventsErr;
  if (playersErr) throw playersErr;

  const ourPlayerIds = new Set(
    ((playerRows ?? []) as unknown as Array<{ id: string }>).map((p) => p.id),
  );

  const rawEvents: GameEvent[] = ((eventRows ?? []) as unknown as Array<{
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
  }>).map((r) => ({
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

  // Apply pitch_reverted / event_voided markers so undone events don't
  // get double-counted by the detectors. Without this, an at-bat that
  // ended in a walk, was Undo'd, and re-scored produces two WALK events
  // in the raw log even though only one walk was actually issued —
  // inflating walks_issued (and other) signals.
  const events = applyPitchRevertedTyped(rawEvents);

  const signals = detectWeaknesses(events, { ourPlayerIds });
  if (signals.length === 0) return [];

  const { data: mapRows, error: mapErr } = await supabase
    .from('weakness_deficit_map')
    .select('weakness_code, deficit_slug');
  if (mapErr) throw mapErr;

  const slugsByCode = new Map<string, string[]>();
  for (const r of (mapRows ?? []) as Array<{ weakness_code: string; deficit_slug: string }>) {
    const list = slugsByCode.get(r.weakness_code);
    if (list) list.push(r.deficit_slug);
    else slugsByCode.set(r.weakness_code, [r.deficit_slug]);
  }

  const neededSlugs = new Set<string>();
  for (const s of signals) for (const slug of slugsByCode.get(s.code) ?? []) neededSlugs.add(slug);

  let idBySlug = new Map<string, string>();
  if (neededSlugs.size > 0) {
    const { data: deficitRows, error: deficitErr } = await supabase
      .from('practice_deficits')
      .select('id, slug')
      .eq('visibility', 'system')
      .in('slug', Array.from(neededSlugs));
    if (deficitErr) throw deficitErr;
    idBySlug = new Map(
      ((deficitRows ?? []) as Array<{ id: string; slug: string }>).map((r) => [r.slug, r.id]),
    );
  }

  return signals.map((s) => {
    const slugs = slugsByCode.get(s.code) ?? [];
    const ids = slugs
      .map((slug) => idBySlug.get(slug))
      .filter((id): id is string => Boolean(id));
    return {
      ...s,
      suggestedDeficitSlugs: slugs,
      suggestedDeficitIds: ids,
    };
  });
}
