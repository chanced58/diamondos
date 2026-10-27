import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { LEAGUE_PLAYER_POSITIONS, createLeaguePlayerSchema, type LeaguePlayerPosition } from '@baseball/shared';
import { useSyncContext } from '../../../../../../src/providers/SyncProvider';
import { ChoiceChips } from '../../../../../../src/features/practices/ChoiceChips';
import { OptionalDate } from '../../../../../../src/features/forms/OptionalDate';
import {
  createLeaguePlayer,
  leagueAdminQueryKey,
  useLeaguePlayers,
  type NewLeaguePlayer,
} from '../../../../../../src/features/league-admin/league-admin-api';
import { POSITION_LABELS } from '../../../../../../src/features/roster/player-form-model';
import { describeApiError } from '../../../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';
const FREE_AGENT = 'free';
const positionLabels = Object.fromEntries(
  LEAGUE_PLAYER_POSITIONS.map((position) => [position, POSITION_LABELS[position as keyof typeof POSITION_LABELS] ?? position]),
) as Record<LeaguePlayerPosition, string>;

/**
 * Registers a player in the league (the web Add Player dialog): name, date of
 * birth, jersey number, position, and a team or the free-agent pool. League
 * admins only.
 */
export default function NewLeaguePlayerScreen() {
  const { leagueId = '' } = useLocalSearchParams<{ leagueId: string }>();
  const query = useLeaguePlayers(leagueId);
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<string | null>(null);
  const [jersey, setJersey] = useState('');
  const [position, setPosition] = useState<LeaguePlayerPosition | null>(null);
  const [teamId, setTeamId] = useState(FREE_AGENT);
  const [problem, setProblem] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (player: NewLeaguePlayer) => createLeaguePlayer(leagueId, player),
    onSuccess: ({ playerId }) => {
      void queryClient.invalidateQueries({ queryKey: leagueAdminQueryKey(leagueId) });
      void triggerSync();
      router.replace({ pathname: '/(tabs)/more/league-admin/[leagueId]/players/[playerId]', params: { leagueId, playerId } });
    },
  });

  const header = <Stack.Screen options={{ title: 'Add player' }} />;
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
  if (!query.data.canEdit) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="League admins only" message="Only league admins add players." />
      </View>
    );
  }

  const { teams } = query.data;
  const submit = () => {
    const trimmedJersey = jersey.trim();
    if (trimmedJersey !== '' && !/^\d{1,2}$/.test(trimmedJersey)) return setProblem('Jersey numbers run 0–99.');
    const parsed = createLeaguePlayerSchema.safeParse({
      leagueId,
      firstName,
      lastName,
      dateOfBirth: dateOfBirth ?? undefined,
      jerseyNumber: trimmedJersey === '' ? undefined : Number(trimmedJersey),
      primaryPosition: position ?? undefined,
      teamId: teamId === FREE_AGENT ? undefined : teamId,
    });
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      return setProblem(field === 'firstName' || field === 'lastName' ? 'Enter a first and last name.' : parsed.error.issues[0]?.message ?? 'Check the form.');
    }
    setProblem(null);
    const { firstName: first, lastName: last, dateOfBirth: dob, jerseyNumber, primaryPosition, teamId: team } = parsed.data;
    create.mutate({ firstName: first, lastName: last, dateOfBirth: dob, jerseyNumber, primaryPosition, teamId: team });
  };

  const error = problem ?? (create.isError ? describeApiError(create.error) : null);
  // Players are usually school age; the date picker starts twelve years back.
  const dobStart = `${new Date().getFullYear() - 12}-01-01`;
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <FormField label="First name" required>
          <TextInput accessibilityLabel="First name" className={inputClass} value={firstName} onChangeText={setFirstName} maxLength={80} />
        </FormField>
        <FormField label="Last name" required>
          <TextInput accessibilityLabel="Last name" className={inputClass} value={lastName} onChangeText={setLastName} maxLength={80} />
        </FormField>
        <OptionalDate label="Date of birth" value={dateOfBirth} today={dobStart} onChange={setDateOfBirth} testID="league-player-dob" />
        <FormField label="Jersey number">
          <TextInput
            accessibilityLabel="Jersey number"
            className={`${inputClass} w-24`}
            keyboardType="number-pad"
            value={jersey}
            onChangeText={setJersey}
            maxLength={2}
          />
        </FormField>
        <FormField label="Primary position">
          <ChoiceChips
            options={[...LEAGUE_PLAYER_POSITIONS]}
            labels={positionLabels}
            selected={position ? [position] : []}
            onChange={(picked) => setPosition((picked.find((value) => value !== position) as LeaguePlayerPosition | undefined) ?? null)}
          />
        </FormField>
        <FormField label="Team">
          <ChoiceChips
            options={[FREE_AGENT, ...teams.map((team) => team.teamId)]}
            labels={{ [FREE_AGENT]: 'Free agent', ...Object.fromEntries(teams.map((team) => [team.teamId, team.name])) }}
            selected={[teamId]}
            onChange={(picked) => setTeamId(picked.find((value) => value !== teamId) ?? teamId)}
          />
        </FormField>
        {error && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {error}
          </Text>
        )}
        <Button label="Add player" loading={create.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
