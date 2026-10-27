import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorState, FormField, ListRow, SectionHeader } from '@baseball/ui';
import { SEASON_TERMS, type SeasonTerm, type TeamSeason } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../../src/providers/SyncProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { ChoiceChips } from '../../../../src/features/practices/ChoiceChips';
import {
  activateSeason,
  createSeason,
  deactivateSeason,
  seasonDates,
  seasonYears,
  useTeamSeasons,
} from '../../../../src/features/seasons/seasons-api';
import { describeApiError, isApiError } from '../../../../src/lib/api-client';

const TERM_LABELS: Record<SeasonTerm, string> = { Spring: 'Spring', Summer: 'Summer', Fall: 'Fall' };

/**
 * The team's seasons (the web team admin Seasons page): coaches create a
 * Spring, Summer or Fall season, which takes in the team's games in its dates
 * that have none, and set the active one or deactivate it.
 */
export default function SeasonsScreen() {
  const { activeTeam, loading } = useRole();
  const { triggerSync } = useSyncContext();
  const teamId = activeTeam?.teamId ?? null;
  const query = useTeamSeasons(teamId);
  const queryClient = useQueryClient();

  const years = seasonYears();
  const yearLabels = Object.fromEntries(years.map((y) => [String(y), String(y)]));
  const [term, setTerm] = useState<SeasonTerm>('Spring');
  const [year, setYear] = useState(String(years[1]));

  // Every team screen that reads the active season (stats, the dashboard) refetches.
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['teams', teamId ?? ''] });
  const create = useMutation({
    mutationFn: () => createSeason(teamId as string, term, Number(year)),
    onSuccess: (result) => {
      refresh();
      if (result.gamesAttached > 0) void triggerSync();
      const games = result.gamesAttached === 1 ? '1 game' : `${result.gamesAttached} games`;
      Alert.alert(`${term} ${year} created`, result.gamesAttached > 0 ? `${games} in its dates joined it.` : 'Set it active when it starts.');
    },
  });
  const activate = useMutation({
    mutationFn: (seasonId: string) => activateSeason(teamId as string, seasonId),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Couldn’t set the active season', describeApiError(error)),
  });
  // A new pick clears the last create's refusal.
  const pick = (change: () => void) => {
    create.reset();
    change();
  };
  const deactivate = useMutation({
    mutationFn: (seasonId: string) => deactivateSeason(teamId as string, seasonId),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Couldn’t deactivate the season', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'Seasons' }} />;
  if (loading || (teamId && query.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!teamId) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No team" message="Join a team to see its seasons." />
      </View>
    );
  }
  if (!query.data) {
    const forbidden = isApiError(query.error) && query.error.kind === 'forbidden';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        {forbidden ? (
          <EmptyState title="Coaches only" message="Head coaches, assistants and athletic directors manage seasons." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const busy = activate.isPending || deactivate.isPending;
  const seasonActions = (season: TeamSeason) =>
    Alert.alert(
      season.name,
      season.isActive ? 'This is the team’s active season.' : 'The active season is the one stats and pitch counts use.',
      [
        season.isActive
          ? { text: 'Deactivate', style: 'destructive' as const, onPress: () => deactivate.mutate(season.seasonId) }
          : { text: 'Set active', onPress: () => activate.mutate(season.seasonId) },
        { text: 'Close', style: 'cancel' as const },
      ],
    );

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <TeamSwitcher />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <SectionHeader title="New season" />
        <FormField label="Season">
          <ChoiceChips
            options={SEASON_TERMS}
            labels={TERM_LABELS}
            selected={[term]}
            onChange={(picked) => pick(() => setTerm(picked.find((t) => t !== term) ?? term))}
          />
        </FormField>
        <FormField label="Year">
          <ChoiceChips
            options={years.map(String)}
            labels={yearLabels}
            selected={[year]}
            onChange={(picked) => pick(() => setYear(picked.find((y) => y !== year) ?? year))}
          />
        </FormField>
        {create.isError && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {describeApiError(create.error)}
          </Text>
        )}
        <Button label={`Create ${term} ${year}`} loading={create.isPending} onPress={() => create.mutate()} />

        <SectionHeader title={`Seasons (${query.data.seasons.length})`} />
        {query.data.seasons.length === 0 ? (
          <Text className="text-sm text-gray-500">No seasons yet. Create one above.</Text>
        ) : (
          <ListGroup>
            {query.data.seasons.map((season) => (
              <ListRow
                key={season.seasonId}
                title={season.name}
                subtitle={seasonDates(season.startDate, season.endDate)}
                right={season.isActive ? <Badge label="Active" variant="safe" /> : <Badge label="Inactive" />}
                onPress={busy ? undefined : () => seasonActions(season)}
              />
            ))}
          </ListGroup>
        )}
      </ScrollView>
    </View>
  );
}
