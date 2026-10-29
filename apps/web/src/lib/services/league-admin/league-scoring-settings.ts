import type { SupabaseClient } from '@supabase/supabase-js';
import {
  leagueAdminInputSchema,
  mergeWithDefaults,
  pitchRuleOptionLabel,
  saveLeagueScoringSettingsInputSchema,
  type LeagueScoringSettingsResponse,
  type SaveLeagueScoringSettingsResponse,
} from '@baseball/shared';
import { authorizeLeagueStaff } from './authorize';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';

/**
 * A league's scoring settings (`leagues.scoring_settings`, the web league
 * admin Scoring Settings form), shared by `POST /api/league/scoring-settings`
 * and the mobile `/api/m/v1/league-admin/:leagueId/scoring-settings` route.
 * League staff read them; only league admins save, which the service role
 * enforces here because RLS lets any league staff member update the row.
 */

const ADMIN_ONLY = 'Only league admins can change the scoring settings.';

function failed<T>(action: string, leagueId: string, actorUserId: string, error: unknown): ServiceResult<T> {
  console.error(`[league-scoring-settings] ${action} failed league=${leagueId} actor=${actorUserId}:`, error);
  return serviceError('failed', 'Something went wrong. Please try again.');
}

export async function loadLeagueScoringSettings(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<LeagueScoringSettingsResponse>> {
  const parsed = leagueAdminInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: false });
  if (!access.ok) return access;

  const [league, rules] = await Promise.all([
    db.from('leagues').select('scoring_settings').eq('id', leagueId).maybeSingle(),
    db
      .from('pitch_compliance_rules')
      .select('id, rule_name, age_min, age_max')
      .is('team_id', null)
      .eq('is_active', true)
      .order('rule_name'),
  ]);
  // A failed read must not hand the form defaults: saving them would
  // overwrite the league's real settings.
  if (league.error) return failed('load settings', leagueId, actorUserId, league.error);
  if (!league.data) return serviceError('not_found', 'League not found.');
  if (rules.error) return failed('load pitch rules', leagueId, actorUserId, rules.error);

  return serviceOk({
    league: access.data.league,
    canEdit: access.data.isLeagueAdmin,
    settings: mergeWithDefaults(league.data.scoring_settings ?? {}),
    pitchRuleOptions: (rules.data ?? []).map((rule) => ({ id: rule.id, label: pitchRuleOptionLabel(rule) })),
  });
}

export async function saveLeagueScoringSettings(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<SaveLeagueScoringSettingsResponse>> {
  const parsed = saveLeagueScoringSettingsInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { leagueId, settings } = parsed.data;

  const access = await authorizeLeagueStaff(db, actorUserId, leagueId, { requireAdmin: true, forbiddenMessage: ADMIN_ONLY });
  if (!access.ok) return access;

  const pitchRuleId = settings.compliance.defaultPitchRuleId;
  if (pitchRuleId) {
    const { data: rule, error } = await db
      .from('pitch_compliance_rules')
      .select('id')
      .eq('id', pitchRuleId)
      .is('team_id', null)
      .maybeSingle();
    if (error) return failed('check pitch rule', leagueId, actorUserId, error);
    if (!rule) return serviceError('invalid', 'Pick one of the pitch-count rulesets.');
  }

  const { data: updated, error } = await db
    .from('leagues')
    .update({ scoring_settings: settings })
    .eq('id', leagueId)
    .select('id');
  if (error) return failed('save settings', leagueId, actorUserId, error);
  if (!updated || updated.length === 0) return serviceError('not_found', 'League not found.');
  return serviceOk({ settings });
}
