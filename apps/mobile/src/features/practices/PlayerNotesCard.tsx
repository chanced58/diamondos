import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@baseball/ui';
import { PRACTICE_NOTE_CATEGORIES, type PracticeDetailResponse } from '@baseball/shared';
import { savePracticeSelfNotes } from './practices-api';
import { describeApiError } from '../../lib/api-client';

type MyPlayer = PracticeDetailResponse['myPlayers'][number];

/**
 * A player's practice notes as the web player view shows them: the coach's
 * notes by category, and their own reflection — which a player writes and a
 * parent only reads.
 */
export function PlayerNotesCard({ practiceId, player, showName, onSaved }: { practiceId: string; player: MyPlayer; showName: boolean; onSaved: () => void }) {
  const saved = player.notes?.playerNotes ?? '';
  const [draft, setDraft] = useState(saved);
  const save = useMutation({
    mutationFn: () => savePracticeSelfNotes(practiceId, player.playerId, draft),
    onSuccess: onSaved,
  });
  const coachNotes = PRACTICE_NOTE_CATEGORIES.filter(({ key }) => player.notes?.[key]);

  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      {showName && <Text className="text-base font-semibold text-gray-900 mb-2">{player.name}</Text>}
      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">From your coaches</Text>
      {coachNotes.length === 0 ? (
        <Text className="text-sm text-gray-400 italic mb-3">No notes from the coaches yet.</Text>
      ) : (
        coachNotes.map(({ key, label }) => (
          <View key={key} className="mb-2">
            <Text className="text-xs font-medium text-gray-600">{label}</Text>
            <Text className="text-sm text-gray-800">{player.notes?.[key]}</Text>
          </View>
        ))
      )}

      <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2 mb-1">
        {player.canEditSelfNotes ? 'My notes' : 'Player’s own notes'}
      </Text>
      {player.canEditSelfNotes ? (
        <>
          <TextInput
            accessibilityLabel="My notes"
            className="border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base min-h-[80px] mb-1"
            multiline
            textAlignVertical="top"
            value={draft}
            onChangeText={setDraft}
            placeholder="How did practice go?"
            placeholderTextColor="#9ca3af"
          />
          <Text className="text-xs text-gray-400 mb-2">You, your coaches and your parents can see this.</Text>
          {save.isError && (
            <Text accessibilityRole="alert" className="text-xs text-red-700 mb-2">{describeApiError(save.error)}</Text>
          )}
          {draft !== saved && <Button label="Save my notes" loading={save.isPending} onPress={() => save.mutate()} />}
        </>
      ) : (
        <Text className={`text-sm ${saved ? 'text-gray-800' : 'text-gray-400 italic'}`}>{saved || 'Nothing written yet.'}</Text>
      )}
    </View>
  );
}
