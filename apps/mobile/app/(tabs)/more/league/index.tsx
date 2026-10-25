import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Badge, Button, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { Feature, type LeaguePageResponse } from '@baseball/shared';
import { useCan, useRole } from '../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { StatTable } from '../../../../src/features/stats/StatTable';
import { useLeaguePage } from '../../../../src/features/league/league-api';
import {
  DEFAULT_STANDINGS_SORT,
  STANDINGS_COLUMNS,
  nextStandingsSort,
  sortStandings,
} from '../../../../src/features/league/standings-model';
import { describeApiError, isApiError } from '../../../../src/lib/api-client';
import { openOnWeb, webUrl } from '../../../../src/lib/web-links';

/**
 * The team's league (the web /league page): its counters, standings by
 * division from completed games — your team highlighted, every column
 * sortable — and its staff. The public league home and league admin open on
 * the web for now.
 */
export default function LeagueScreen() {
  const { activeTeam } = useRole();
  // As on the web, on plans with league management; checked again after a team switch.
  const onPlan = useCan(Feature.LEAGUE_MANAGEMENT);
  const query = useLeaguePage(onPlan ? activeTeam?.teamId : undefined);
  const [sort, setSort] = useState(DEFAULT_STANDINGS_SORT);

  const header = <Stack.Screen options={{ title: (onPlan && query.data?.league.name) || 'League' }} />;
  if (activeTeam && !onPlan) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        <EmptyState title="League" message="The league page is on plans with league management." />
      </View>
    );
  }
  if (query.isPending && activeTeam) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    const noLeague = !activeTeam || (isApiError(query.error) && query.error.kind === 'not_found');
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        {noLeague ? (
          <EmptyState title="No league" message="Your team is not currently part of a league. Contact your league administrator to be added." />
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
      <TeamSwitcher />
      {query.isRefetchError && (
        <View className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex-row items-center justify-between">
          <Text accessibilityRole="alert" className="text-sm text-red-700 flex-1 mr-2">
            Couldn't refresh the standings: {describeApiError(query.error)}
          </Text>
          <Button label="Retry" variant="ghost" size="sm" onPress={() => void query.refetch()} />
        </View>
      )}
      <View className="px-4 pt-4">
        <Text className="text-2xl font-bold text-gray-900">{page.league.name}</Text>
        {page.league.description && <Text className="text-sm text-gray-500 mt-1">{page.league.description}</Text>}
        <Counters counters={page.counters} />
      </View>

      {page.divisions.map((division) => (
        <View key={division.id} className="mt-2">
          <View className="px-4">
            <SectionHeader title={division.name} />
          </View>
          <StatTable
            rows={sortStandings(division.teams, sort)}
            rowKey={(row) => row.key}
            rowLabel={(row) => (row.isActive ? `${row.name} (you)` : row.name)}
            labelHeader="Team"
            labelWidth={150}
            columns={STANDINGS_COLUMNS}
            sort={sort}
            onSort={(key) => setSort((current) => nextStandingsSort(current, key))}
            highlightRow={(row) => row.isActive}
            emptyText="No teams in this division."
          />
        </View>
      ))}

      <View className="px-4">
        {page.staff.length > 0 && (
          <>
            <SectionHeader title="League staff" />
            <ListGroup>
              {page.staff.map((member) => (
                <ListRow
                  key={member.id}
                  title={member.name}
                  right={<Badge label={member.role === 'league_admin' ? 'Admin' : 'Manager'} variant="default" />}
                />
              ))}
            </ListGroup>
          </>
        )}
        <WebLinks page={page} />
      </View>
    </ScrollView>
  );
}

/** Teams · Divisions · Games played · Your rank, as the web counters strip. */
function Counters({ counters }: { counters: LeaguePageResponse['counters'] }) {
  const tiles = [
    { label: 'Teams', value: String(counters.teams) },
    { label: 'Divisions', value: String(counters.divisions) },
    { label: 'Games played', value: String(counters.gamesPlayed) },
    { label: 'Your rank', value: counters.yourRank ? `#${counters.yourRank}` : '—' },
  ];
  return (
    <View className="flex-row flex-wrap gap-2 mt-4">
      {tiles.map((tile) => (
        <View key={tile.label} className="bg-white rounded-xl border border-gray-200 px-3 py-2.5" style={{ flexBasis: '48%', flexGrow: 1 }}>
          <Text className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{tile.label}</Text>
          <Text className="text-xl font-bold text-gray-900 mt-0.5">{tile.value}</Text>
        </View>
      ))}
    </View>
  );
}

/** The public league home and, for league admins, league management, on the web. */
function WebLinks({ page }: { page: LeaguePageResponse }) {
  if (!webUrl('/')) return null;
  const slug = page.league.slug;
  return (
    <View className="gap-2 mt-4">
      {slug && <Button label="View the public league home" variant="secondary" onPress={() => void openOnWeb(`/l/${slug}`)} />}
      {page.isLeagueAdmin && <Button label="Manage the league on the web" variant="ghost" onPress={() => void openOnWeb('/league/admin')} />}
    </View>
  );
}
