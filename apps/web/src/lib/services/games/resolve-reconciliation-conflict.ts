import type { SupabaseClient } from '@supabase/supabase-js';
import { conflictKey, resolveReconciliationConflictInputSchema, type ScoreConflict } from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { authorizeGameCoach } from './authorize';

/**
 * Accepts the away scorekeeper's value for one reconciliation conflict, or
 * reverts it to the home value. Only the home (canonical) team's coach may
 * do this; overrides annotate the record and never touch game_events.
 */
export async function resolveReconciliationConflict(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<{ homeGameId: string }>> {
  const parsed = resolveReconciliationConflictInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;

  const { data: recon } = await db
    .from('game_reconciliations')
    .select('id, home_game_id, conflicts')
    .eq('id', input.reconciliationId)
    .maybeSingle();
  if (!recon) return serviceError('not_found', 'Reconciliation not found.');

  const auth = await authorizeGameCoach(db, actorUserId, recon.home_game_id as string);
  if (!auth.ok) {
    return auth.code === 'forbidden'
      ? serviceError('forbidden', 'Only the home team coach can resolve conflicts.')
      : auth;
  }

  // Reject a key that no longer matches a current conflict (stale screen or
  // tampered input) so resolved_overrides never accumulates dangling entries.
  const conflicts = Array.isArray(recon.conflicts) ? (recon.conflicts as ScoreConflict[]) : [];
  if (!conflicts.some((c) => conflictKey(c) === input.conflictKey)) {
    return serviceError('conflict', 'That conflict no longer exists — reload the game.');
  }

  // One UPDATE that filters-then-appends, so two near-simultaneous edits can't
  // drop each other's change.
  const { error } = await db.rpc('set_reconciliation_override', {
    p_reconciliation_id: input.reconciliationId,
    p_key: input.conflictKey,
    p_use_away: input.useAwayValue,
    p_resolved_by: actorUserId,
  });
  if (error) {
    console.error(`[resolveReconciliationConflict] recon=${input.reconciliationId} actor=${actorUserId}:`, error);
    return serviceError('failed', `Failed to save override: ${error.message}`);
  }

  return serviceOk({ homeGameId: recon.home_game_id as string });
}
