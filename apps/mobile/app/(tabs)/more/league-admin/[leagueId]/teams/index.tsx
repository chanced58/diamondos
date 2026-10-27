import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { groupLeagueTeamsByDivision, type LeagueAdminDivision, type LeagueTeamMembership } from '@baseball/shared';
import { ListGroup } from '../../../../../../src/features/navigation/ListGroup';
import {
  addLeagueDivision,
  leagueAdminQueryKey,
  removeLeagueDivision,
  useLeagueTeams,
} from '../../../../../../src/features/league-admin/league-admin-api';
import { describeApiError, isApiError } from '../../../../../../src/lib/api-client';

/** "Valley HS · Opponent". */
function teamSubtitle(team: LeagueTeamMembership): string | undefined {
  return [team.organization, team.isOpponentTeam && 'Opponent'].filter(Boolean).join(' · ') || undefined;
}

/**
 * The league's divisions and teams (the web league admin page's Divisions and
 * Teams): league staff add and remove divisions; league admins open a team to
 * move it between divisions, activate or deactivate it, or remove it. Adding
 * teams stays on the web.
 */
export default function LeagueTeamsScreen() {
  const { leagueId = '' } = useLocalSearchParams<{ leagueId: string }>();
  const query = useLeagueTeams(leagueId);
  const queryClient = useQueryClient();
  const [divisionName, setDivisionName] = useState('');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: leagueAdminQueryKey(leagueId) });
  const add = useMutation({
    mutationFn: (name: string) => addLeagueDivision(leagueId, name),
    onSuccess: () => {
      setDivisionName('');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (divisionId: string) => removeLeagueDivision(leagueId, divisionId),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Couldn’t remove the division', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'Teams and divisions' }} />;
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
          <EmptyState title="League staff only" message="Only the league’s admins and managers see its teams." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const { teams, divisions, canEditTeams, canEditDivisions } = query.data;
  const groups = groupLeagueTeamsByDivision(teams, divisions);
  const teamCount = (division: LeagueAdminDivision) => teams.filter((team) => team.divisionId === division.id).length;
  const confirmRemove = (division: LeagueAdminDivision) =>
    Alert.alert(`Remove ${division.name}?`, 'Its teams stay in the league with no division.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(division.id) },
    ]);
  const submitDivision = () => {
    if (!divisionName.trim()) return;
    add.mutate(divisionName.trim());
  };

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView
        className="flex-1 bg-gray-50"
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        {header}
        <SectionHeader title={`Divisions (${divisions.length})`} />
        {divisions.length === 0 ? (
          <Text className="text-sm text-gray-500 mb-3">No divisions yet.</Text>
        ) : (
          <ListGroup>
            {divisions.map((division) => {
              const count = teamCount(division);
              return (
                <ListRow
                  key={division.id}
                  title={division.name}
                  subtitle={`${count} ${count === 1 ? 'team' : 'teams'}`}
                  showChevron={false}
                  onPress={canEditDivisions && !remove.isPending ? () => confirmRemove(division) : undefined}
                />
              );
            })}
          </ListGroup>
        )}
        {canEditDivisions && (
          <View className="mt-3">
            <View className="flex-row gap-2">
              <TextInput
                accessibilityLabel="Division name"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base"
                placeholder="Division name (e.g. North)"
                placeholderTextColor="#9ca3af"
                value={divisionName}
                onChangeText={(text) => {
                  setDivisionName(text);
                  if (add.isError) add.reset();
                }}
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={submitDivision}
              />
              <Button label="Add" loading={add.isPending} disabled={!divisionName.trim()} onPress={submitDivision} />
            </View>
            {add.isError && (
              <Text accessibilityRole="alert" className="text-sm text-red-700 mt-2">
                {describeApiError(add.error)}
              </Text>
            )}
            {divisions.length > 0 && <Text className="text-xs text-gray-500 mt-2">Tap a division to remove it.</Text>}
          </View>
        )}

        {teams.length === 0 ? (
          <>
            <SectionHeader title="Teams" />
            <Text className="text-sm text-gray-500">No teams in this league yet. Add them on the web.</Text>
          </>
        ) : (
          groups.map((group) => (
            <View key={group.divisionId ?? 'none'}>
              <SectionHeader title={`${group.name} (${group.teams.length})`} />
              {group.teams.length === 0 ? (
                <Text className="text-sm text-gray-500">No teams in this division.</Text>
              ) : (
                <ListGroup>
                  {group.teams.map((team) => (
                    <ListRow
                      key={team.membershipId}
                      title={team.name}
                      subtitle={teamSubtitle(team)}
                      right={team.isActive ? undefined : <Badge label="Inactive" />}
                      showChevron={canEditTeams}
                      onPress={
                        canEditTeams
                          ? () =>
                              router.push({
                                pathname: '/(tabs)/more/league-admin/[leagueId]/teams/[membershipId]',
                                params: { leagueId, membershipId: team.membershipId },
                              })
                          : undefined
                      }
                    />
                  ))}
                </ListGroup>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
