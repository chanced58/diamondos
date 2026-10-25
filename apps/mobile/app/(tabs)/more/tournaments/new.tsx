import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { Button, ErrorState, FormField, SegmentedControl } from '@baseball/ui';
import { utcToZonedDateTime } from '@baseball/shared';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { useSyncContext } from '../../../../src/providers/SyncProvider';
import { DateTimeFields } from '../../../../src/features/forms/DateTimeFields';
import { ChoiceChips } from '../../../../src/features/practices/ChoiceChips';
import { deviceTimeZone } from '../../../../src/features/games/game-form-model';
import { createTournament, tournamentsQueryKey, useTournamentTeamOptions } from '../../../../src/features/tournaments/tournaments-api';
import {
  emptyTournamentFormValues,
  lineupSummary,
  parseTournamentForm,
  type TournamentFormValues,
  type TournamentTeamType,
} from '../../../../src/features/tournaments/tournament-form-model';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';
const MAX_BATTER_OPTIONS = Array.from({ length: 21 }, (_, index) => String(index + 10));
const MAX_BATTER_LABELS = Object.fromEntries(MAX_BATTER_OPTIONS.map((n) => [n, n])) as Record<string, string>;

/**
 * Set up a tournament (the web's /tournaments/new): its name and days, the
 * team that plays it — one the user heads, or a new tournament team kept apart
 * from it — and the lineup rules. Created by the permission-checked RPC.
 */
export default function NewTournamentScreen() {
  const { user } = useAuth();
  const { triggerSync } = useSyncContext();
  const queryClient = useQueryClient();
  const teams = useTournamentTeamOptions(user?.id);
  // One request id per form, so a retried submit can't create two tournaments.
  const [requestId] = useState(() => randomUUID());
  const [values, setValues] = useState<TournamentFormValues | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (teams.data && !values) {
      setValues(emptyTournamentFormValues(utcToZonedDateTime(new Date(), deviceTimeZone()).date, teams.data[0]?.id ?? null));
    }
  }, [teams.data, values]);

  const create = useMutation({
    mutationFn: createTournament,
    onSuccess: ({ tournamentId }) => {
      void queryClient.invalidateQueries({ queryKey: tournamentsQueryKey });
      // A new tournament team joins the user's teams; pull it so the team switcher shows it.
      void triggerSync();
      router.replace({ pathname: '/(tabs)/more/tournaments/[tournamentId]', params: { tournamentId } });
    },
  });

  const header = <Stack.Screen options={{ title: 'New tournament' }} />;
  if (teams.isError) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message="Couldn't load your teams." onRetry={() => void teams.refetch()} />
      </View>
    );
  }
  if (!values || !teams.data) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  const set = (patch: Partial<TournamentFormValues>) => setValues((current) => (current ? { ...current, ...patch } : current));
  const submit = () => {
    const parsed = parseTournamentForm(values, requestId);
    setValidationError(parsed.ok ? null : parsed.error);
    if (parsed.ok) create.mutate(parsed.input);
  };
  const error = validationError ?? (create.error instanceof Error ? create.error.message : null);
  const teamOptions = teams.data;

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      {header}
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <FormField label="Tournament name" required>
          <TextInput accessibilityLabel="Tournament name" className={inputClass} value={values.name} onChangeText={(name) => set({ name })} maxLength={100} />
        </FormField>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Starts" required>
              <DateTimeFields date={values.startDate} time="12:00" showTime={false} onChange={({ date }) => set({ startDate: date })} testID="tournament-start" />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Ends" required>
              <DateTimeFields date={values.endDate} time="12:00" showTime={false} onChange={({ date }) => set({ endDate: date })} testID="tournament-end" />
            </FormField>
          </View>
        </View>

        <FormField label="Team">
          <SegmentedControl<TournamentTeamType>
            options={[
              { value: 'existing', label: 'My team' },
              { value: 'new', label: 'New tournament team' },
            ]}
            value={values.teamType}
            onChange={(teamType) => set({ teamType })}
          />
        </FormField>
        {values.teamType === 'existing' ? (
          teamOptions.length > 0 ? (
            <FormField label="Which team">
              <ChoiceChips
                options={teamOptions.map((t) => t.id)}
                labels={Object.fromEntries(teamOptions.map((t) => [t.id, t.name]))}
                selected={[values.teamId]}
                onChange={(picked) => set({ teamId: picked.find((id) => id !== values.teamId) ?? values.teamId })}
              />
            </FormField>
          ) : (
            <Text className="text-sm text-gray-600 mb-4">Only a team's head coach or athletic director can enter it. Create a new tournament team instead.</Text>
          )
        ) : (
          <>
            <FormField label="Team name" required>
              <TextInput accessibilityLabel="Team name" className={inputClass} value={values.teamName} onChangeText={(teamName) => set({ teamName })} maxLength={100} />
            </FormField>
            <View className="flex-row gap-3">
              <View className="flex-1">
                <FormField label="Organization">
                  <TextInput accessibilityLabel="Organization" className={inputClass} value={values.organization} onChangeText={(organization) => set({ organization })} maxLength={100} />
                </FormField>
              </View>
              <View className="w-24">
                <FormField label="State">
                  <TextInput
                    accessibilityLabel="State"
                    className={inputClass}
                    value={values.stateCode}
                    onChangeText={(stateCode) => set({ stateCode: stateCode.toUpperCase() })}
                    autoCapitalize="characters"
                    maxLength={2}
                    placeholder="ID"
                    placeholderTextColor="#9ca3af"
                  />
                </FormField>
              </View>
            </View>
          </>
        )}

        <View className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-3">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 mr-3">
              <Text className="text-base text-gray-900">More than 9 batters</Text>
              <Text className="text-xs text-gray-500">Allow an expanded batting order.</Text>
            </View>
            <Switch accessibilityLabel="Allow expanded lineups" value={values.allowExpanded} onValueChange={(allowExpanded) => set({ allowExpanded })} />
          </View>
          {values.allowExpanded && (
            <View className="mt-3">
              <Text className="text-xs font-semibold text-gray-500 mb-2">Most batters</Text>
              <ChoiceChips
                options={MAX_BATTER_OPTIONS}
                labels={MAX_BATTER_LABELS}
                selected={[String(values.maxBatters)]}
                onChange={(picked) => set({ maxBatters: Number(picked.find((n) => n !== String(values.maxBatters)) ?? values.maxBatters) })}
              />
            </View>
          )}
        </View>
        <View className="flex-row items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-4">
          <View className="flex-1 mr-3">
            <Text className="text-base text-gray-900">Mid-game changes</Text>
            <Text className="text-xs text-gray-500">Let the batting order grow or shrink during a game.</Text>
          </View>
          <Switch accessibilityLabel="Allow mid-game changes" value={values.allowMidGameChanges} onValueChange={(allowMidGameChanges) => set({ allowMidGameChanges })} />
        </View>
        <Text className="text-sm text-gray-600 mb-4">{lineupSummary(values)}</Text>

        {error && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <Text accessibilityRole="alert" className="text-sm text-red-700">{error}</Text>
          </View>
        )}
        <Button label="Create tournament" size="lg" loading={create.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
