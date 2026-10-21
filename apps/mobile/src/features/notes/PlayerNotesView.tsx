import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@baseball/ui';
import type { GameNotesPlayer, GameNotesResponse } from '@baseball/shared';
import { describeApiError } from '../../lib/api-client';
import { useDiscardGuard } from '../forms/use-discard-guard';
import { gameNotesQueryKey, savePlayerNotes } from './game-notes-api';
import { filledCategories } from './game-notes-model';
import { NoteBody, NoteHeading, NoteInput } from './NoteText';

/**
 * What a player, parent or other team member sees (the web's PlayerGameView):
 * the coach's overall notes, then for each player shown, the coach's
 * assessment and the player's own notes — editable only by that player.
 */
export function PlayerNotesView({ notes }: { notes: GameNotesResponse }) {
  const isParent = notes.view === 'parent';
  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <NoteHeading title="Overall notes" tag="From the coach" />
        <NoteBody text={notes.overallNotes} emptyText="No overall notes posted yet." />

        {notes.players.map((player) => (
          <PlayerSection key={player.playerId} gameId={notes.gameId} player={player} showName={isParent} />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PlayerSection({ gameId, player, showName }: { gameId: string; player: GameNotesPlayer; showName: boolean }) {
  const firstName = player.name.split(' ')[0] ?? player.name;
  const assessment = filledCategories(player.assessment);

  return (
    <View className={showName ? 'mt-6 bg-white border border-gray-200 rounded-2xl p-4' : ''}>
      {showName && <Text accessibilityRole="header" className="text-lg font-semibold text-gray-900">{player.name}</Text>}

      <NoteHeading title="Coach's assessment" tag={showName ? `${firstName}'s feedback` : 'Your feedback'} />
      {assessment.length > 0 ? (
        <View className="bg-white border border-gray-200 rounded-xl px-4 py-3 gap-3">
          {assessment.map(({ label, value }) => (
            <View key={label}>
              <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-0.5">{label}</Text>
              <Text className="text-sm text-gray-800">{value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <NoteBody
          text={null}
          emptyText={showName ? `No coach assessment for ${firstName} yet.` : "Your coach hasn't added notes for you yet."}
        />
      )}

      {player.canEditSelfNotes ? (
        <SelfNotesEditor gameId={gameId} player={player} />
      ) : (
        <>
          <NoteHeading title={`${firstName}'s notes`} tag="Player and coaches" />
          <NoteBody text={player.selfNotes} emptyText={`${firstName} hasn't added any notes yet.`} />
        </>
      )}
    </View>
  );
}

function SelfNotesEditor({ gameId, player }: { gameId: string; player: GameNotesPlayer }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(player.selfNotes ?? '');
  const [draft, setDraft] = useState(saved);
  const dirty = draft !== saved;
  useDiscardGuard(dirty, 'Your notes have not been saved.');

  const save = useMutation({
    mutationFn: (text: string) => savePlayerNotes(gameId, player.playerId, text),
    onSuccess: async (_result, text) => {
      setSaved(text);
      await queryClient.invalidateQueries({ queryKey: gameNotesQueryKey(gameId) });
    },
  });

  return (
    <>
      <NoteHeading title="My notes" tag="You and your coaches" />
      <NoteInput
        accessibilityLabel="My notes"
        value={draft}
        onChangeText={setDraft}
        placeholder="How did the game go? What felt good? What do you want to work on?"
      />
      {save.isError && (
        <Text accessibilityRole="alert" className="text-sm text-red-700 mt-2">{describeApiError(save.error)}</Text>
      )}
      {save.isSuccess && !dirty && <Text className="text-sm text-green-700 mt-2">Notes saved.</Text>}
      <View className="mt-3 items-end">
        <Button label="Save my notes" loading={save.isPending} disabled={!dirty} onPress={() => save.mutate(draft)} />
      </View>
    </>
  );
}
