import { ActivityIndicator, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ErrorState } from '@baseball/ui';
import { useGameNotes } from '../../../../../src/features/notes/game-notes-api';
import { CoachNotesForm } from '../../../../../src/features/notes/CoachNotesForm';
import { PlayerNotesView } from '../../../../../src/features/notes/PlayerNotesView';
import { describeApiError } from '../../../../../src/lib/api-client';

/** A game's notes (the web's /games/[gameId]/notes): coaches edit, everyone else reads. */
export default function GameNotesScreen() {
  const { gameId = '' } = useLocalSearchParams<{ gameId: string }>();
  const query = useGameNotes(gameId);
  const header = <Stack.Screen options={{ title: 'Game notes' }} />;

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

  return (
    <>
      {header}
      {query.data.view === 'coach' ? <CoachNotesForm notes={query.data} /> : <PlayerNotesView notes={query.data} />}
    </>
  );
}
