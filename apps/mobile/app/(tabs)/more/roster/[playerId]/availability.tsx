import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField, SectionHeader } from '@baseball/ui';
import { partitionInjuryFlags, type InjuryCatalogEntry, type InjuryFlag } from '@baseball/shared';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { ChoiceChips } from '../../../../../src/features/practices/ChoiceChips';
import { DateTimeFields } from '../../../../../src/features/forms/DateTimeFields';
import {
  addInjuryFlag,
  endInjuryFlag,
  playerAvailabilityQueryKey,
  usePlayerAvailability,
  type NewInjuryFlag,
} from '../../../../../src/features/roster/roster-api';
import { localToday } from '../../../../../src/features/stats/season-stats-api';
import { describeApiError } from '../../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** "Mar 4" style, read in the device's zone (flags are plain dates). */
function shortDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * A player's injury and availability flags (the web availability page):
 * active, upcoming and past ones, and a form to add one. Active flags keep
 * contraindicated drills out of the AI drill recommender. Roster managers only.
 */
export default function AvailabilityScreen() {
  const { playerId = '' } = useLocalSearchParams<{ playerId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const query = usePlayerAvailability(teamId, playerId);
  const queryClient = useQueryClient();
  const today = localToday();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: playerAvailabilityQueryKey(teamId ?? '', playerId) });
  const add = useMutation({
    mutationFn: (flag: NewInjuryFlag) => addInjuryFlag(teamId as string, playerId, flag),
    onSuccess: refresh,
  });
  const end = useMutation({
    mutationFn: (flagId: string) => endInjuryFlag(teamId as string, playerId, flagId, localToday()),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Couldn’t end the flag', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'Availability' }} />;
  if (query.isPending && teamId) {
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
        {teamId ? (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState title="No team" message="Join a team to see its roster." />
        )}
      </View>
    );
  }

  const { player, flags, catalog } = query.data;
  const catalogBySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const { active, upcoming, past } = partitionInjuryFlags(flags, today);

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <Text className="text-xl font-bold text-gray-900">
          {player.firstName} {player.lastName}
          {player.jerseyNumber != null && <Text className="text-gray-400 font-normal"> #{player.jerseyNumber}</Text>}
        </Text>
        <Text className="text-sm text-gray-500 mt-1">
          Active injury and availability flags suppress drills tagged as contraindicated in the AI drill recommender.
        </Text>

        {active.length > 0 && (
          <FlagSection
            title="Active flags"
            flags={active}
            catalogBySlug={catalogBySlug}
            onEnd={(flag) =>
              Alert.alert('End this flag today?', catalogBySlug.get(flag.injurySlug)?.name ?? flag.injurySlug, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'End today', onPress: () => end.mutate(flag.id) },
              ])
            }
            ending={end.isPending ? end.variables : undefined}
          />
        )}
        {upcoming.length > 0 && <FlagSection title="Upcoming flags" flags={upcoming} catalogBySlug={catalogBySlug} />}

        <SectionHeader title="Add a flag" />
        <AddFlagForm
          catalog={catalog}
          today={today}
          saving={add.isPending}
          saveError={add.isError ? describeApiError(add.error) : null}
          savedCount={add.isSuccess ? add.submittedAt : 0}
          onSubmit={(flag) => add.mutate(flag)}
        />

        {past.length > 0 && <FlagSection title="Past flags" flags={past} catalogBySlug={catalogBySlug} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FlagSection({
  title,
  flags,
  catalogBySlug,
  onEnd,
  ending,
}: {
  title: string;
  flags: InjuryFlag[];
  catalogBySlug: Map<string, InjuryCatalogEntry>;
  onEnd?: (flag: InjuryFlag) => void;
  ending?: string;
}) {
  return (
    <>
      <SectionHeader title={title} />
      <View className="bg-white rounded-xl border border-gray-200">
        {flags.map((flag, index) => {
          const injury = catalogBySlug.get(flag.injurySlug);
          return (
            <View key={flag.id} className={`px-4 py-3 ${index > 0 ? 'border-t border-gray-100' : ''}`}>
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900">{injury?.name ?? flag.injurySlug}</Text>
                  {injury && <Text className="text-xs text-gray-500">{injury.bodyPart.replace(/_/g, ' ')}</Text>}
                  <Text className="text-sm text-gray-600 mt-1">
                    {shortDate(flag.effectiveFrom)} – {flag.effectiveTo ? shortDate(flag.effectiveTo) : 'open-ended'}
                  </Text>
                  {flag.notes && <Text className="text-sm text-gray-800 mt-1">{flag.notes}</Text>}
                </View>
                {onEnd && (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel={`End ${injury?.name ?? flag.injurySlug} today`}
                    disabled={ending === flag.id}
                    onPress={() => onEnd(flag)}
                    className="px-2 py-1"
                  >
                    <Text className={`text-sm font-semibold ${ending === flag.id ? 'text-gray-400' : 'text-brand-700'}`}>
                      {ending === flag.id ? 'Ending…' : 'End today'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** The web's add-a-flag form: an injury from the catalog, a start date, an optional end date and notes. */
function AddFlagForm({
  catalog,
  today,
  saving,
  saveError,
  savedCount,
  onSubmit,
}: {
  catalog: InjuryCatalogEntry[];
  today: string;
  saving: boolean;
  saveError: string | null;
  /** Changes after each successful save, to clear the form. */
  savedCount: number;
  onSubmit: (flag: NewInjuryFlag) => void;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const [from, setFrom] = useState(today);
  const [hasEnd, setHasEnd] = useState(false);
  const [to, setTo] = useState(today);
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState(savedCount);

  if (savedCount !== lastSaved) {
    setLastSaved(savedCount);
    setSlug(null);
    setFrom(today);
    setHasEnd(false);
    setTo(today);
    setNotes('');
  }

  if (catalog.length === 0) {
    return <Text className="text-sm text-gray-500">There are no injuries to flag yet. Add them on the web.</Text>;
  }

  const submit = () => {
    if (!slug) return setProblem('Pick an injury.');
    if (hasEnd && to < from) return setProblem('End date must be on or after start date.');
    setProblem(null);
    onSubmit({ injurySlug: slug, effectiveFrom: from, effectiveTo: hasEnd ? to : null, notes: notes.trim() || null });
  };

  const error = problem ?? saveError;
  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4">
      <FormField label="Injury" required>
        <ChoiceChips
          options={catalog.map((entry) => entry.slug)}
          labels={Object.fromEntries(catalog.map((entry) => [entry.slug, entry.name]))}
          selected={slug ? [slug] : []}
          onChange={(picked) => setSlug(picked.find((value) => value !== slug) ?? null)}
        />
      </FormField>
      <FormField label="Start date">
        <DateTimeFields date={from} time="00:00" showTime={false} onChange={({ date }) => setFrom(date)} testID="flag-from" />
      </FormField>
      <FormField label="End date">
        {hasEnd ? (
          <View className="flex-row items-center gap-3">
            <DateTimeFields date={to} time="00:00" showTime={false} onChange={({ date }) => setTo(date)} testID="flag-to" />
            <TouchableOpacity accessibilityRole="button" onPress={() => setHasEnd(false)}>
              <Text className="text-sm text-gray-500">Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity accessibilityRole="button" onPress={() => setHasEnd(true)}>
            <Text className="text-sm font-semibold text-brand-700">Open-ended · add an end date</Text>
          </TouchableOpacity>
        )}
      </FormField>
      <FormField label="Notes">
        <TextInput
          accessibilityLabel="Notes"
          className={`${inputClass} min-h-[72px]`}
          multiline
          textAlignVertical="top"
          value={notes}
          onChangeText={setNotes}
          maxLength={1000}
        />
      </FormField>
      {error && (
        <Text accessibilityRole="alert" className="text-sm text-red-700 mb-2">
          {error}
        </Text>
      )}
      <Button label="Add flag" loading={saving} onPress={submit} />
    </View>
  );
}
