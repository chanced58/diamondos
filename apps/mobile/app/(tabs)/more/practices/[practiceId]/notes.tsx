import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField, SectionHeader } from '@baseball/ui';
import { PRACTICE_NOTE_CATEGORIES } from '@baseball/shared';
import { practiceQueryKey, savePracticeNotes, usePractice } from '../../../../../src/features/practices/practices-api';
import { filledCount, notesDraftFrom, notesInput, type NotesDraft } from '../../../../../src/features/practices/notes-draft';
import { describeApiError } from '../../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base min-h-[72px]';

/**
 * The coach's practice notes (the web notes form): overall notes the team
 * sees, private coach notes, and each player's notes by category, which that
 * player and their parents see. Coaches only.
 */
export default function PracticeNotesScreen() {
  const { practiceId = '' } = useLocalSearchParams<{ practiceId: string }>();
  const queryClient = useQueryClient();
  const query = usePractice(practiceId);
  const original = useMemo(() => (query.data ? notesDraftFrom(query.data) : null), [query.data]);
  const [draft, setDraft] = useState<NotesDraft | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Seed the form once; a later refetch must not wipe what the coach is typing.
  useEffect(() => {
    if (original && !draft) setDraft(original);
  }, [original, draft]);

  const save = useMutation({
    mutationFn: () => savePracticeNotes(practiceId, notesInput(original!, draft!)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: practiceQueryKey(practiceId) });
      router.back();
    },
  });

  const header = <Stack.Screen options={{ title: 'Practice notes' }} />;

  if (query.isPending || (query.data && !draft)) {
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
  const coach = query.data.coach;
  if (!coach || !draft) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches write practice notes." />
      </View>
    );
  }

  const setPlayer = (playerId: string, key: string, value: string) =>
    setDraft((current) => current && { ...current, players: { ...current.players, [playerId]: { ...current.players[playerId], [key]: value } } });

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <FormField label="Overall notes">
          <TextInput
            accessibilityLabel="Overall notes"
            className={inputClass}
            multiline
            textAlignVertical="top"
            value={draft.overallNotes}
            onChangeText={(overallNotes) => setDraft({ ...draft, overallNotes })}
            placeholder="Players and parents see these."
            placeholderTextColor="#9ca3af"
          />
        </FormField>
        <FormField label="Coach notes">
          <TextInput
            accessibilityLabel="Coach notes"
            className={inputClass}
            multiline
            textAlignVertical="top"
            value={draft.coachNotes}
            onChangeText={(coachNotes) => setDraft({ ...draft, coachNotes })}
            placeholder="Only coaches see these."
            placeholderTextColor="#9ca3af"
          />
        </FormField>

        <SectionHeader title="Players" />
        {coach.players.map((player) => {
          const expanded = open === player.id;
          const filled = filledCount(draft.players[player.id]);
          return (
            <View key={player.id} className="bg-white rounded-xl border border-gray-200 mb-2 overflow-hidden">
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setOpen(expanded ? null : player.id)}
                className="flex-row items-center justify-between px-4 py-3"
              >
                <Text className="text-base font-medium text-gray-900">
                  {player.lastName}, {player.firstName}
                  {player.jerseyNumber != null && <Text className="text-gray-400"> #{player.jerseyNumber}</Text>}
                </Text>
                <Text className="text-xs text-gray-500">{filled > 0 ? `${filled} note${filled === 1 ? '' : 's'}` : 'Add notes'}</Text>
              </TouchableOpacity>
              {expanded && (
                <View className="px-4 pb-3">
                  {PRACTICE_NOTE_CATEGORIES.map(({ key, label }) => (
                    <FormField key={key} label={label}>
                      <TextInput
                        accessibilityLabel={`${label} notes for ${player.firstName} ${player.lastName}`}
                        className={inputClass}
                        multiline
                        textAlignVertical="top"
                        value={draft.players[player.id]?.[key] ?? ''}
                        onChangeText={(value) => setPlayer(player.id, key, value)}
                      />
                    </FormField>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {save.isError && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 my-3">
            <Text accessibilityRole="alert" className="text-sm text-red-700">{describeApiError(save.error)}</Text>
          </View>
        )}
        <View className="mt-3">
          <Button label="Save notes" size="lg" loading={save.isPending} disabled={save.isPending} onPress={() => save.mutate()} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
