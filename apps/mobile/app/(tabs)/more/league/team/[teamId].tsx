import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { EmptyState, ErrorState, SectionHeader } from '@baseball/ui';
import type { LeagueTeamPlayerTable, LeagueTeamResponse } from '@baseball/shared';
import { StatTable } from '../../../../../src/features/stats/StatTable';
import { useLeagueTeam } from '../../../../../src/features/league/league-home-api';
import {
  defaultPlayerSort,
  formatRecord,
  formatWinPct,
  nextPlayerSort,
  playerTableColumns,
  sortPlayerRows,
} from '../../../../../src/features/league/league-home-model';
import { describeApiError, isApiError } from '../../../../../src/lib/api-client';

/**
 * A team's stat page in its league (the web /l/:slug/team/:teamId page): its
 * record, rank and division, team stats, and its players' batting and
 * pitching lines, every column sortable. A player whose stats are hidden
 * shows "—" and sorts last.
 */
export default function LeagueTeamScreen() {
  const { slug = '', teamId = '', season } = useLocalSearchParams<{ slug: string; teamId: string; season?: string }>();
  const query = useLeagueTeam(slug, teamId, season || undefined);

  const header = <Stack.Screen options={{ title: query.data?.team.name ?? 'Team' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    const notFound = isApiError(query.error) && query.error.kind === 'not_found';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {notFound ? (
          <EmptyState title="Team not found" message="This team has no stats in the league this season." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const page = query.data;
  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <TeamHero page={page} />

      {page.teamStats.length > 0 && (
        <View className="px-4 mt-2">
          <SectionHeader title="Team stats" />
          <View className="flex-row flex-wrap gap-2">
            {page.teamStats.map((stat) => (
              <View key={stat.key} className="bg-white rounded-xl border border-gray-200 px-3 py-2" style={{ flexBasis: '31%', flexGrow: 1 }}>
                <Text className="text-[11px] font-semibold text-gray-500 uppercase">{stat.label}</Text>
                <Text className="text-lg font-bold text-gray-900">{stat.display}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View className="px-4 mt-2">
        <SectionHeader title="Batting" />
      </View>
      <PlayerTable table={page.batting} nameHeader="Player" emptyText="No players yet for this season." />

      {page.pitching.rows.length > 0 && (
        <>
          <View className="px-4 mt-2">
            <SectionHeader title="Pitching" />
          </View>
          <PlayerTable table={page.pitching} nameHeader="Pitcher" emptyText="No pitchers yet." />
        </>
      )}
    </ScrollView>
  );
}

/** Record, place in the league, division and runs. */
function TeamHero({ page }: { page: LeagueTeamResponse }) {
  const { record, rank } = page;
  const facts = [
    rank.rank ? `#${rank.rank} of ${rank.total}` : null,
    page.divisionName,
    `${record.runsFor} RF · ${record.runsAgainst} RA`,
  ].filter(Boolean);
  return (
    <View className="bg-brand-700 px-4 pt-5 pb-4">
      <Text className="text-xs font-semibold text-white/70 uppercase tracking-wide">
        {page.league.name}
        {page.season ? ` · ${page.season}` : ''}
      </Text>
      <Text className="text-2xl font-bold text-white mt-1">{page.team.name}</Text>
      <Text className="text-lg font-semibold text-white mt-1">
        {formatRecord(record)} <Text className="text-white/70">({formatWinPct(record)})</Text>
      </Text>
      <Text className="text-sm text-white/80 mt-1">{facts.join(' · ')}</Text>
    </View>
  );
}

/** A sortable player table, first on its lead column best first. */
function PlayerTable({ table, nameHeader, emptyText }: { table: LeagueTeamPlayerTable; nameHeader: string; emptyText: string }) {
  const [sort, setSort] = useState(() => defaultPlayerSort(table));
  return (
    <StatTable
      rows={sortPlayerRows(table.rows, sort)}
      rowKey={(row) => row.playerId}
      rowLabel={(row) => row.name}
      labelHeader={nameHeader}
      columns={playerTableColumns(table)}
      sort={sort}
      onSort={(key) => setSort((current) => nextPlayerSort(table, current, key))}
      emptyText={emptyText}
    />
  );
}
