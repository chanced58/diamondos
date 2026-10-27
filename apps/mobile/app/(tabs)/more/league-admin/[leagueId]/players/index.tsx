import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Badge, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { filterLeaguePlayers, type LeagueAdminPlayer, type LeaguePlayerFilter } from '@baseball/shared';
import { ListGroup } from '../../../../../../src/features/navigation/ListGroup';
import { ChoiceChips } from '../../../../../../src/features/practices/ChoiceChips';
import { useLeaguePlayers } from '../../../../../../src/features/league-admin/league-admin-api';
import { POSITION_SHORT_LABELS } from '../../../../../../src/features/roster/player-form-model';
import { describeApiError, isApiError } from '../../../../../../src/lib/api-client';

const ALL = 'all';
const FREE = 'free';

/** "1 team", "2 teams". */
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** "#7 · SS · Hawks", or "Free agent". */
function playerSubtitle(player: LeagueAdminPlayer): string {
  const position = player.primaryPosition
    ? POSITION_SHORT_LABELS[player.primaryPosition as keyof typeof POSITION_SHORT_LABELS] ?? player.primaryPosition
    : null;
  return [player.jerseyNumber != null && `#${player.jerseyNumber}`, position, player.teamName ?? 'Free agent'].filter(Boolean).join(' · ');
}

/**
 * The league's players (the web League Players page): search by name or
 * jersey, filter by team, free agents or division. League admins add players
 * from the header; a row opens the player.
 */
export default function LeaguePlayersScreen() {
  const { leagueId = '' } = useLocalSearchParams<{ leagueId: string }>();
  const query = useLeaguePlayers(leagueId);
  const [search, setSearch] = useState('');
  const [teamId, setTeamId] = useState(ALL);
  const [divisionId, setDivisionId] = useState(ALL);

  const canEdit = query.data?.canEdit ?? false;
  const header = (
    <Stack.Screen
      options={{
        title: 'League players',
        headerRight: canEdit
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add player"
                onPress={() => router.push({ pathname: '/(tabs)/more/league-admin/[leagueId]/players/new', params: { leagueId } })}
                hitSlop={12}
              >
                <Text className="text-white text-2xl font-light">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    const notStaff = isApiError(query.error) && (query.error.kind === 'not_found' || query.error.kind === 'forbidden');
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {notStaff ? (
          <EmptyState title="League staff only" message="Only the league’s admins and managers see its players." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const { players, teams, divisions } = query.data;
  const filter: LeaguePlayerFilter = {
    search,
    teamId: teamId === ALL ? '' : teamId,
    divisionId: divisionId === ALL || teamId === FREE ? '' : divisionId,
  };
  const shown = filterLeaguePlayers(players, teams, filter);
  const freeAgents = players.filter((player) => player.teamId === null).length;
  const teamOptions = [ALL, FREE, ...teams.map((team) => team.teamId)];
  const teamLabels = { [ALL]: 'All teams', [FREE]: `Free agents (${freeAgents})`, ...Object.fromEntries(teams.map((t) => [t.teamId, t.name])) };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <Text className="text-sm text-gray-500 mb-3">
        {count(players.length, 'player')} · {count(freeAgents, 'free agent')} · {count(teams.length, 'team')}
      </Text>
      <TextInput
        accessibilityLabel="Search players"
        className="border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base mb-3"
        placeholder="Search name or jersey…"
        placeholderTextColor="#9ca3af"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <ChoiceChips
        options={teamOptions}
        labels={teamLabels}
        selected={[teamId]}
        onChange={(picked) => setTeamId(picked.find((value) => value !== teamId) ?? teamId)}
      />
      {divisions.length > 0 && teamId !== FREE && (
        <View className="mt-2">
          <ChoiceChips
            options={[ALL, ...divisions.map((d) => d.id)]}
            labels={{ [ALL]: 'All divisions', ...Object.fromEntries(divisions.map((d) => [d.id, d.name])) }}
            selected={[divisionId]}
            onChange={(picked) => setDivisionId(picked.find((value) => value !== divisionId) ?? divisionId)}
          />
        </View>
      )}

      <SectionHeader title={`Players (${shown.length})`} />
      {shown.length === 0 ? (
        <Text className="text-sm text-gray-500">No players match these filters.</Text>
      ) : (
        <ListGroup>
          {shown.map((player) => (
            <ListRow
              key={player.playerId}
              title={`${player.firstName} ${player.lastName}`}
              subtitle={playerSubtitle(player)}
              right={player.teamId === null ? <Badge label="Free agent" variant="warning" /> : undefined}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/more/league-admin/[leagueId]/players/[playerId]',
                  params: { leagueId, playerId: player.playerId },
                })
              }
            />
          ))}
        </ListGroup>
      )}
    </ScrollView>
  );
}
