import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { ChoiceChips } from '../../../../../../src/features/practices/ChoiceChips';
import {
  leagueAdminQueryKey,
  removeLeagueTeam,
  setLeagueTeamActive,
  setLeagueTeamDivision,
  useLeagueTeams,
} from '../../../../../../src/features/league-admin/league-admin-api';
import { describeApiError } from '../../../../../../src/lib/api-client';

const NO_DIVISION = 'none';

/**
 * A team's seat in the league (a row of the web league admin Teams table):
 * league admins move it between divisions, activate or deactivate it, or
 * remove it from the league for good.
 */
export default function LeagueTeamScreen() {
  const { leagueId = '', membershipId = '' } = useLocalSearchParams<{ leagueId: string; membershipId: string }>();
  const query = useLeagueTeams(leagueId);
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: leagueAdminQueryKey(leagueId) });

  const division = useMutation({
    mutationFn: (divisionId: string | null) => setLeagueTeamDivision(leagueId, membershipId, divisionId),
    onSuccess: () => void refresh(),
    onError: (error) => Alert.alert('Couldn’t move the team', describeApiError(error)),
  });
  const active = useMutation({
    mutationFn: (isActive: boolean) => setLeagueTeamActive(leagueId, membershipId, isActive),
    onSuccess: () => void refresh(),
    onError: (error) => Alert.alert('Couldn’t change the team', describeApiError(error)),
  });
  const remove = useMutation({
    mutationFn: () => removeLeagueTeam(leagueId, membershipId),
    onSuccess: () => {
      void refresh();
      router.back();
    },
    onError: (error) => Alert.alert('Couldn’t remove the team', describeApiError(error)),
  });

  const team = query.data?.teams.find((t) => t.membershipId === membershipId);
  const header = <Stack.Screen options={{ title: team?.name ?? 'Team' }} />;
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
  if (!team) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Team not found" message="This team isn’t in the league any more." />
      </View>
    );
  }
  if (!query.data.canEditTeams) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="League admins only" message="Only league admins change teams." />
      </View>
    );
  }

  const { divisions } = query.data;
  const busy = division.isPending || active.isPending || remove.isPending;
  const selected = team.divisionId ?? NO_DIVISION;
  const confirmRemove = () =>
    Alert.alert(`Remove ${team.name} from the league?`, 'This can’t be undone. Deactivate the team instead to keep it on the books.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <View className="flex-row items-center gap-2">
        <Text className="text-2xl font-bold text-gray-900 flex-shrink">{team.name}</Text>
        {team.isActive ? <Badge label="Active" variant="safe" /> : <Badge label="Inactive" />}
      </View>
      {(team.organization || team.isOpponentTeam) && (
        <Text className="text-sm text-gray-500 mt-1">
          {[team.organization, team.isOpponentTeam && 'Opponent team'].filter(Boolean).join(' · ')}
        </Text>
      )}

      <View className="mt-4">
        <FormField label="Division">
          {divisions.length === 0 ? (
            <Text className="text-sm text-gray-500">The league has no divisions yet.</Text>
          ) : (
            <ChoiceChips
              options={[NO_DIVISION, ...divisions.map((d) => d.id)]}
              labels={{ [NO_DIVISION]: 'None', ...Object.fromEntries(divisions.map((d) => [d.id, d.name])) }}
              selected={[selected]}
              onChange={(picked) => {
                const next = picked.find((value) => value !== selected);
                if (!next || busy) return;
                division.mutate(next === NO_DIVISION ? null : next);
              }}
            />
          )}
        </FormField>
      </View>

      <View className="gap-2 mt-2">
        <Button
          label={team.isActive ? 'Deactivate team' : 'Activate team'}
          variant="secondary"
          loading={active.isPending}
          disabled={busy}
          onPress={() => active.mutate(!team.isActive)}
        />
        <Text className="text-xs text-gray-500 mb-2">
          {team.isActive ? 'An inactive team keeps its games and stats, but players can’t be assigned to it.' : 'Activating puts the team back in the league.'}
        </Text>
        <Button label="Remove from league" variant="danger" loading={remove.isPending} disabled={busy} onPress={confirmRemove} />
      </View>
    </ScrollView>
  );
}
