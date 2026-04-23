import {
  computePitcherAvailability,
  PitcherAvailabilityStatus,
  PitcherEligibilitySource,
  PlayerPosition,
  type PitchComplianceRule,
  type PitcherAvailability,
  type PitchCountRecord,
  type Player,
} from '@baseball/shared';
import type { TypedSupabaseClient } from '../client';

export interface BullpenPitcherEntry {
  player: Player;
  availability: PitcherAvailability;
  eligibilitySource: PitcherEligibilitySource;
}

export interface BullpenPlan {
  rule: PitchComplianceRule | null;
  pitchers: BullpenPitcherEntry[];
}

/**
 * Loads the full availability picture for a team's pitchers on a given date.
 *
 * A player counts as a bullpen candidate when any of the following is true:
 *  - primary_position = 'pitcher'
 *  - 'pitcher' is in secondary_positions
 *  - they have at least one row in pitch_counts (i.e., pitched in a game before)
 *
 * eligibilitySource reports which rule matched, preferring primary → secondary
 * → game_history when multiple apply. The caller (UI) uses it to explain to a
 * coach why a player shows up in the list.
 *
 * Returns `rule: null` when no compliance rule is configured — caller should
 * render a "configure your compliance rule" callout.
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
        .eq('is_active', true),
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

  const allRosterRows = (playerRows ?? []) as unknown as Array<{
    id: string;
    team_id: string;
    user_id: string | null;
    first_name: string;
    last_name: string;
    jersey_number: number | null;
    primary_position: string | null;
    secondary_positions: string[] | null;
    bats: string | null;
    throws: string | null;
    date_of_birth: string | null;
    graduation_year: number | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;

  // Find which of the team's active players have pitching history. We scope to
  // the roster we just loaded — if a player has pitched on another team, their
  // history only counts here when they're on this roster.
  const rosterIds = allRosterRows.map((r) => r.id);
  const historyIds = new Set<string>();
  if (rosterIds.length > 0) {
    const { data: histRows, error: histErr } = await supabase
      .from('pitch_counts')
      .select('player_id')
      .in('player_id', rosterIds)
      .limit(10000);
    if (histErr) throw histErr;
    for (const r of (histRows ?? []) as Array<{ player_id: string }>) {
      historyIds.add(r.player_id);
    }
  }

  // Classify eligibility. primary > secondary > game_history.
  const qualifiedRows: Array<{
    row: (typeof allRosterRows)[number];
    source: PitcherEligibilitySource;
  }> = [];
  for (const row of allRosterRows) {
    if (row.primary_position === PlayerPosition.PITCHER) {
      qualifiedRows.push({ row, source: PitcherEligibilitySource.PRIMARY });
    } else if ((row.secondary_positions ?? []).includes(PlayerPosition.PITCHER)) {
      qualifiedRows.push({ row, source: PitcherEligibilitySource.SECONDARY });
    } else if (historyIds.has(row.id)) {
      qualifiedRows.push({ row, source: PitcherEligibilitySource.GAME_HISTORY });
    }
  }

  const pitchers: Player[] = qualifiedRows.map(({ row: r }) => ({
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

  const sourceByPlayerId = new Map(
    qualifiedRows.map(({ row, source }) => [row.id, source]),
  );

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
        eligibilitySource:
          sourceByPlayerId.get(p.id) ?? PitcherEligibilitySource.PRIMARY,
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
      eligibilitySource:
        sourceByPlayerId.get(p.id) ?? PitcherEligibilitySource.PRIMARY,
    })),
  };
}
