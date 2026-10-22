import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { EmptyState, ErrorState, ListRow, SegmentedControl } from '@baseball/ui';
import type { StatTier } from '@baseball/shared';
import { useRole } from '../../../src/providers/RoleProvider';
import { ListGroup } from '../../../src/features/navigation/ListGroup';
import { StatTable } from '../../../src/features/stats/StatTable';
import { useLeagueStats } from '../../../src/features/stats/league-stats-api';
import {
  TIER_OPTIONS,
  nextSort,
  pitchingStatColumns,
  seasonBattingColumns,
  seasonBattingTotals,
  seasonPitchingTotals,
  sortStatRows,
  statValue,
  type SortState,
} from '../../../src/features/stats/season-stats-model';
import { describeApiError } from '../../../src/lib/api-client';

type Section = 'hitting' | 'pitching';

const SECTION_OPTIONS = [
  { value: 'hitting', label: 'Hitting' },
  { value: 'pitching', label: 'Pitching' },
] as const;

const DEFAULT_SORTS: Record<Section, SortState> = {
  hitting: { key: 'plateAppearances', ascending: false },
  pitching: { key: 'inningsPitchedOuts', ascending: false },
};

/**
 * Every player across the team's league (the web League Stats page), names
 * tagged with their team. Like the web page, it shows the free plan's columns
 * whatever the plan, and no rest — rules differ from team to team.
 */
export default function LeagueStatsScreen() {
  const { activeTeam } = useRole();
  const query = useLeagueStats(activeTeam?.teamId);
  const [section, setSection] = useState<Section>('hitting');
  const [tier, setTier] = useState<StatTier>('high_school');
  const [sorts, setSorts] = useState(DEFAULT_SORTS);

  const header = <Stack.Screen options={{ title: query.data?.league.name ?? 'League stats' }} />;

  if (!activeTeam) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No team" message="Join a team to see its league." />
      </View>
    );
  }
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const stats = query.data;
  const onSort = (key: string) => setSorts({ ...sorts, [section]: nextSort(sorts[section], key) });

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <Text className="text-sm text-gray-500 mb-3">
        {stats.teamCount} {stats.teamCount === 1 ? 'team' : 'teams'} · {stats.gameCount} {stats.gameCount === 1 ? 'game' : 'games'}
      </Text>

      <View className="mb-3">
        <ListGroup>
          <ListRow
            title="Team comparison"
            subtitle="Records, runs, AVG and ERA side by side"
            onPress={() => router.push('/(tabs)/stats/league-teams')}
          />
        </ListGroup>
      </View>

      <View className="gap-2">
        <SegmentedControl options={SECTION_OPTIONS} value={section} onChange={setSection} testID="league-section" />
        <SegmentedControl options={TIER_OPTIONS} value={tier} onChange={setTier} testID="league-tier" />
      </View>

      <View className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
        {section === 'hitting' ? (
          <StatTable
            rows={sortStatRows(stats.batting, sorts.hitting, (r) => r.playerName, statValue)}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.playerName}
            columns={seasonBattingColumns(tier, false)}
            totals={seasonBattingTotals(stats.batting, tier, false)}
            emptyText="No hitting data across league teams yet."
            labelHeader="Batter"
            sort={sorts.hitting}
            onSort={onSort}
          />
        ) : (
          <StatTable
            rows={sortStatRows(stats.pitching, sorts.pitching, (r) => r.playerName, statValue)}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.playerName}
            columns={pitchingStatColumns(tier, false)}
            totals={seasonPitchingTotals(stats.pitching, tier, false)}
            emptyText="No pitching data across league teams yet."
            labelHeader="Pitcher"
            sort={sorts.pitching}
            onSort={onSort}
          />
        )}
      </View>
    </ScrollView>
  );
}
