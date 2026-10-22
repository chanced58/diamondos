import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Badge, EmptyState, ErrorState } from '@baseball/ui';
import {
  PitcherAvailabilityStatus,
  PitcherEligibilitySource,
  type BullpenPitcher,
  type BullpenResponse,
} from '@baseball/shared';
import { useCan, useRole } from '../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../src/features/teams/TeamSwitcher';
import { useBullpenPlan } from '../../../src/features/stats/season-stats-api';
import { addDays, formatPlanDate } from '../../../src/features/stats/season-stats-model';
import { describeApiError } from '../../../src/lib/api-client';

const STATUS: Record<PitcherAvailabilityStatus, { label: string; variant: 'safe' | 'warning' | 'danger' }> = {
  [PitcherAvailabilityStatus.AVAILABLE]: { label: 'Available', variant: 'safe' },
  [PitcherAvailabilityStatus.LIMITED]: { label: 'Limited', variant: 'warning' },
  [PitcherAvailabilityStatus.UNAVAILABLE]: { label: 'Unavailable', variant: 'danger' },
};

const ELIGIBILITY: Record<PitcherEligibilitySource, string> = {
  [PitcherEligibilitySource.PRIMARY]: 'Primary',
  [PitcherEligibilitySource.SECONDARY]: 'Secondary',
  [PitcherEligibilitySource.GAME_HISTORY]: 'Game history',
};

const DATE_SOURCE: Record<BullpenResponse['dateSource'], string> = {
  requested: '',
  next_game: 'Next game',
  today: 'Today',
};

/**
 * The Bullpen Planner (the web /bullpen): who can pitch on a day under the
 * team's pitch-count rule. Opens on the next game's day; coaches only.
 */
export default function BullpenScreen() {
  const { activeTeam } = useRole();
  const isCoach = useCan('team.coach');
  const teamId = isCoach ? activeTeam?.teamId : undefined;
  const [date, setDate] = useState<string | undefined>(undefined);
  const query = useBullpenPlan(teamId, date);

  const header = <Stack.Screen options={{ title: 'Bullpen planner' }} />;

  if (!isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        <EmptyState title="Coaches only" message="Only coaches can use the bullpen planner." />
      </View>
    );
  }

  const plan = query.data;
  const counts = plan ? countByStatus(plan.pitchers) : null;
  // The day asked for, not the plan on screen: while a day loads the last plan
  // stays up, and stepping from its date would repeat the same day.
  const shownDate = date ?? plan?.date;

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <TeamSwitcher />
      {plan && shownDate && (
        <View className="flex-row items-center justify-between px-4 py-2 bg-white border-b border-gray-200">
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous day" hitSlop={8} onPress={() => setDate(addDays(shownDate, -1))}>
            <Text className="text-blue-700 text-base">‹ Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to the next game"
            disabled={date === undefined}
            onPress={() => setDate(undefined)}
            className="items-center"
          >
            <Text className="text-sm font-semibold text-gray-900">{formatPlanDate(shownDate)}</Text>
            <Text className="text-xs text-gray-500">{date === undefined ? DATE_SOURCE[plan.dateSource] : 'Tap for the next game'}</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next day" hitSlop={8} onPress={() => setDate(addDays(shownDate, 1))}>
            <Text className="text-blue-700 text-base">Next ›</Text>
          </TouchableOpacity>
        </View>
      )}

      {query.isPending ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !plan ? (
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        >
          {plan.rule ? (
            <Text className="text-sm text-gray-600 mb-1">
              Rule: <Text className="font-semibold text-gray-800">{plan.rule.ruleName}</Text> ({plan.rule.maxPitchesPerDay} max/day)
            </Text>
          ) : (
            <View className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <Text className="text-sm text-amber-900">
                No active pitch compliance rule for this team. Set one up on the web under Admin → Compliance to compute rest days.
              </Text>
            </View>
          )}
          {counts && (
            <Text className="text-xs text-gray-500 mb-3">
              {counts.available} available · {counts.limited} limited · {counts.unavailable} unavailable
            </Text>
          )}

          {plan.pitchers.length === 0 ? (
            <Text className="text-sm text-gray-500">
              No pitchers found. Give players pitcher as a primary or secondary position, or score a game to include pitchers by
              game history.
            </Text>
          ) : (
            <View className="rounded-xl border border-gray-200 bg-white">
              {plan.pitchers.map((pitcher, index) => (
                <PitcherRow key={pitcher.playerId} pitcher={pitcher} divided={index > 0} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function PitcherRow({ pitcher, divided }: { pitcher: BullpenPitcher; divided: boolean }) {
  const status = STATUS[pitcher.status];
  const hand = pitcher.throws === 'left' ? 'LHP' : pitcher.throws === 'switch' ? 'SHP' : pitcher.throws ? 'RHP' : null;
  return (
    <View className={`px-4 py-3 ${divided ? 'border-t border-gray-100' : ''}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-semibold text-gray-900 flex-1" numberOfLines={1}>
          {pitcher.lastName}, {pitcher.firstName}
          {pitcher.jerseyNumber != null && <Text className="text-xs font-normal text-gray-400"> #{pitcher.jerseyNumber}</Text>}
        </Text>
        <Badge label={status.label} variant={status.variant} />
      </View>
      <Text className="text-xs text-gray-500 mt-0.5">
        {[hand, ELIGIBILITY[pitcher.eligibility], `${pitcher.pitchesLast7d} pitches last 7d`].filter(Boolean).join(' · ')}
      </Text>
      <Text className="text-xs text-gray-600 mt-1">{pitcher.reason}</Text>
    </View>
  );
}

function countByStatus(pitchers: BullpenPitcher[]) {
  const count = (status: PitcherAvailabilityStatus) => pitchers.filter((p) => p.status === status).length;
  return {
    available: count(PitcherAvailabilityStatus.AVAILABLE),
    limited: count(PitcherAvailabilityStatus.LIMITED),
    unavailable: count(PitcherAvailabilityStatus.UNAVAILABLE),
  };
}
