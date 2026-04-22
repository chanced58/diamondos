import {
  computePitcherAvailability,
  PitcherAvailabilityStatus,
  type PitchComplianceRule,
  type PitcherAvailability,
  type PitchCountRecord,
  type Player,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

export interface BullpenPlan {
  rule: PitchComplianceRule | null;
  pitchers: Array<{ player: Player; availability: PitcherAvailability }>;
}

/**
 * Loads the full availability picture for a team's pitchers on a given date:
 *  - the pitchers on the roster (primary_position='pitcher', active)
 *  - their last 10 days of pitch_counts
 *  - the team's (or fallback system) active compliance rule
 * Then delegates to computePitcherAvailability() for the rule-based status.
 *
 * Returns `rule: null` when no rule is configured — caller should render a
 * "configure your compliance rule" callout.
 */
export async function listPitchersWithUsage(
  supabase: TypedSupabaseClient,
  teamId: string,
  asOfDate: Date,
): Promise<BullpenPlan> {
  const fromDate = new Date(asOfDate);
  fromDate.setDate(fromDate.getDate() - 10);
  const fromIso = fromDate.toISOString().split('T')[0];
  const toIso = asOfDate.toISOString().split('T')[0];

  const [{ data: playerRows, error: playersErr }, { data: ruleRows, error: ruleErr }] =
    await Promise.all([
      supabase
        .from('players')
        .select('*')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .eq('primary_position', 'pitcher'),
      supabase
        .from('pitch_compliance_rules')
        .select('*')
        .or(`team_id.eq.${teamId},team_id.is.null`)
        .eq('is_active', true)
        .order('team_id', { ascending: false, nullsFirst: false })
        .limit(1),
    ]);
  if (playersErr) throw playersErr;
  if (ruleErr) throw ruleErr;

  const pitcherRows = (playerRows ?? []) as unknown as Array<{
    id: string;
    team_id: string;
    user_id: string | null;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    primary_position: string | null;
    bats: string | null;
    throws: string | null;
    date_of_birth: string | null;
    graduation_year: number | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;

  const pitchers: Player[] = pitcherRows.map((r) => ({
    id: r.id,
    teamId: r.team_id,
    userId: r.user_id ?? undefined,
    firstName: r.first_name,
    lastName: r.last_name,
    jerseyNumber: r.jersey_number ?? undefined,
    primaryPosition: (r.primary_position ?? undefined) as Player['primaryPosition'],
    bats: (r.bats ?? undefined) as Player['bats'],
    throws: (r.throws ?? undefined) as Player['throws'],
    dateOfBirth: r.date_of_birth ?? undefined,
    graduationYear: r.graduation_year ?? undefined,
    notes: r.notes ?? undefined,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  const ruleData = ((ruleRows ?? []) as unknown as Array<{
    id: string;
    team_id: string | null;
    rule_name: string;
    max_pitches_per_day: number;
    rest_day_thresholds: Record<string, number>;
    age_min: number | null;
    age_max: number | null;
    applies_from: string | null;
    applies_until: string | null;
    is_active: boolean;
    created_at: string;
  }>)[0];

  const rule: PitchComplianceRule | null = ruleData
    ? {
        id: ruleData.id,
        teamId: ruleData.team_id ?? undefined,
        ruleName: ruleData.rule_name,
        maxPitchesPerDay: ruleData.max_pitches_per_day,
        restDayThresholds: ruleData.rest_day_thresholds,
        ageMin: ruleData.age_min ?? undefined,
        ageMax: ruleData.age_max ?? undefined,
        appliesFrom: ruleData.applies_from ?? undefined,
        appliesUntil: ruleData.applies_until ?? undefined,
        isActive: ruleData.is_active,
        createdAt: ruleData.created_at,
      }
    : null;

  if (pitchers.length === 0 || !rule) {
    return {
      rule,
      pitchers: pitchers.map((p) => ({
        player: p,
        availability: {
          playerId: p.id,
          status: PitcherAvailabilityStatus.AVAILABLE,
          nextAvailableDate: null,
          pitchesLast7d: 0,
          reason: rule
            ? 'No recent pitching history — fully rested.'
            : 'No compliance rule configured for this team.',
        },
      })),
    };
  }

  // Fetch pitch counts for these pitchers in the window.
  const pitcherIds = pitchers.map((p) => p.id);
  const { data: countRows, error: countErr } = await supabase
    .from('pitch_counts')
    .select('player_id, game_date, pitch_count')
    .in('player_id', pitcherIds)
    .gte('game_date', fromIso)
    .lte('game_date', toIso)
    .order('game_date', { ascending: false });
  if (countErr) throw countErr;

  const records: PitchCountRecord[] = ((countRows ?? []) as unknown as Array<{
    player_id: string;
    game_date: string;
    pitch_count: number;
  }>).map((r) => ({
    playerId: r.player_id,
    gameDate: r.game_date,
    pitchCount: r.pitch_count,
  }));

  const availability = computePitcherAvailability(pitchers, records, rule, asOfDate);
  const availabilityByPlayer = new Map(availability.map((a) => [a.playerId, a]));

  return {
    rule,
    pitchers: pitchers.map((p) => ({
      player: p,
      availability:
        availabilityByPlayer.get(p.id) ?? {
          playerId: p.id,
          status: PitcherAvailabilityStatus.AVAILABLE,
          nextAvailableDate: null,
          pitchesLast7d: 0,
          reason: 'No recent history.',
        },
    })),
  };
}
