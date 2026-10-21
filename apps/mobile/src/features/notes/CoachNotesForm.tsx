import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@baseball/ui';
import { GAME_NOTE_CATEGORIES, type GameNotesResponse, type GameNoteCategory } from '@baseball/shared';
import { describeApiError } from '../../lib/api-client';
import { useDiscardGuard } from '../forms/use-discard-guard';
import { gameNotesQueryKey, saveCoachNotes } from './game-notes-api';
import { assessmentChanged, coachNotesChanges, coachNotesDraftFrom, type CoachNotesDraft } from './game-notes-model';
import { NoteBody, NoteHeading, NoteInput } from './NoteText';

/** Wide enough (iPad) to set the six assessment boxes two to a row. */
const TWO_COLUMN_MIN_WIDTH = 700;

/**
 * The coach's notes editor (the web's GameNotesForm): overall notes, coach-only
 * notes, and a collapsible assessment per player with their self-reflection.
 * Saves only what changed.
 */
export function CoachNotesForm({ notes }: { notes: GameNotesResponse }) {
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const [original, setOriginal] = useState(() => coachNotesDraftFrom(notes));
  const [draft, setDraft] = useState(original);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const changes = coachNotesChanges(original, draft);
  useDiscardGuard(changes !== null, 'Your notes have not been saved.');

  // The baseline becomes the snapshot that was sent, so edits typed while the
  // save was in flight stay unsaved.
  const save = useMutation({
    mutationFn: ({ sent }: { snapshot: CoachNotesDraft; sent: NonNullable<typeof changes> }) =>
      saveCoachNotes(notes.gameId, sent),
    onSuccess: async (_result, { snapshot }) => {
      setOriginal(snapshot);
      setSavedAt(Date.now());
      await queryClient.invalidateQueries({ queryKey: gameNotesQueryKey(notes.gameId) });
    },
  });

  const edit = (patch: Partial<CoachNotesDraft>) => {
    setSavedAt(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const editCategory = (playerId: string, key: GameNoteCategory, value: string) =>
    edit({ assessments: { ...draft.assessments, [playerId]: { ...draft.assessments[playerId], [key]: value } } });

  const toggle = (playerId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });

  const twoColumns = width >= TWO_COLUMN_MIN_WIDTH;

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <NoteHeading title="Overall notes" tag="All team members" />
        <NoteInput
          accessibilityLabel="Overall notes"
          value={draft.overallNotes}
          onChangeText={(overallNotes) => edit({ overallNotes })}
          placeholder="Game summary, key moments, conditions…"
        />

        <NoteHeading title="Coach's notes" tag="Coaches only" />
        <NoteInput
          accessibilityLabel="Coach's notes"
          value={draft.coachNotes}
          onChangeText={(coachNotes) => edit({ coachNotes })}
          placeholder="Internal observations, strategy, follow-ups…"
        />

        <NoteHeading title={`Player notes (${notes.players.length})`} />
        {notes.players.length === 0 && (
          <Text className="text-sm text-gray-500">No active players on the roster yet.</Text>
        )}
        <View className="gap-2">
          {notes.players.map((player) => {
            const open = expanded.has(player.playerId);
            const edited = assessmentChanged(original, draft, player.playerId);
            return (
              <View key={player.playerId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${player.name} notes`}
                  onPress={() => toggle(player.playerId)}
                  className="flex-row items-center px-4 py-3"
                >
                  <Text className="flex-1 text-base font-medium text-gray-900" numberOfLines={1}>
                    {player.jerseyNumber !== null && <Text className="text-gray-400">#{player.jerseyNumber} </Text>}
                    {player.name}
                  </Text>
                  {edited && <Text className="text-xs text-amber-700 mr-2">Edited</Text>}
                  {player.selfNotes && <Text className="text-xs text-blue-700 mr-2">Player notes</Text>}
                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" />
                </TouchableOpacity>

                {open && (
                  <View className="border-t border-gray-100 px-4 pb-4">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-3 mb-2">
                      Coach's assessment
                    </Text>
                    <View className={twoColumns ? 'flex-row flex-wrap -mx-1' : ''}>
                      {GAME_NOTE_CATEGORIES.map(({ key, label }) => (
                        <View key={key} className={twoColumns ? 'w-1/2 px-1 mb-3' : 'mb-3'}>
                          <Text className="text-xs font-semibold text-gray-500 mb-1">{label}</Text>
                          <NoteInput
                            accessibilityLabel={`${player.name} ${label}`}
                            value={draft.assessments[player.playerId]?.[key] ?? ''}
                            onChangeText={(value) => editCategory(player.playerId, key, value)}
                            placeholder={`${label} notes…`}
                            style={{ minHeight: 72 }}
                          />
                        </View>
                      ))}
                    </View>
                    <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-1 mb-2">
                      Player's self-reflection
                    </Text>
                    <NoteBody text={player.selfNotes} emptyText="No self-reflection yet." />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View className="border-t border-gray-200 bg-white px-4 pt-3 pb-6">
        {save.isError && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-2">
            {describeApiError(save.error)}
          </Text>
        )}
        {savedAt !== null && !changes && <Text className="text-sm text-green-700 mb-2">Notes saved.</Text>}
        <Button
          label={save.isPending ? 'Saving…' : 'Save notes'}
          size="lg"
          loading={save.isPending}
          disabled={!changes}
          onPress={() => changes && save.mutate({ snapshot: draft, sent: changes })}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
