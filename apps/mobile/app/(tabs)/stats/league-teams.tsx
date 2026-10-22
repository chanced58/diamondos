import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { EmptyState, ErrorState } from '@baseball/ui';
import { useRole } from '../../../src/providers/RoleProvider';
import { StatTable } from '../../../src/features/stats/StatTable';
import { useLeagueComparison } from '../../../src/features/stats/league-stats-api';
import { COMPARISON_COLUMNS, comparisonSortValue } from '../../../src/features/stats/league-model';
import { nextSort, sortStatRows, type SortState } from '../../../src/features/stats/season-stats-model';
import { describeApiError } from '../../../src/lib/api-client';

/**
 * Every team in the league side by side (the web Team Comparison page), best
 * record first; your team is tinted. Opponent teams without DiamondOS are seen
 * from the games against them.
 */
export default function TeamComparisonScreen() {
  const { activeTeam } = useRole();
  const query = useLeagueComparison(activeTeam?.teamId);
  const [sort, setSort] = useState<SortState>({ key: 'pct', ascending: false });

  const header = <Stack.Screen options={{ title: 'Team comparison' }} />;

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

  const { league, rows } = query.data;
  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <Text className="text-sm text-gray-500 mb-3">{league.name} · completed games</Text>
      <View className="rounded-xl border border-gray-200 overflow-hidden">
        <StatTable
          rows={sortStatRows(rows, sort, (r) => r.teamName, comparisonSortValue)}
          rowKey={(r) => r.teamId}
          rowLabel={(r) => (r.isOpponentTeam ? `${r.teamName} (opp.)` : r.teamName)}
          columns={COMPARISON_COLUMNS}
          emptyText="No teams in this league yet."
          labelHeader="Team"
          labelWidth={176}
          sort={sort}
          onSort={(key) => setSort(nextSort(sort, key))}
          highlightRow={(r) => r.teamId === activeTeam.teamId}
        />
      </View>
      {rows.some((r) => r.isOpponentTeam) && (
        <Text className="text-xs text-gray-400 mt-2">
          "opp." teams aren't on DiamondOS; their numbers come from games league teams played against them.
        </Text>
      )}
    </ScrollView>
  );
}
