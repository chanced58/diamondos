import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { withObservables } from '@nozbe/with-observables';
import { database } from '../../../src/db';
import type { Game } from '../../../src/db/models/Game';
import { formatDate, formatTime } from '@baseball/shared';

interface GamesListProps {
  games: Game[];
}

function GamesList({ games }: GamesListProps) {
  if (games.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-gray-400 text-lg text-center">No games scheduled.</Text>
        <Text className="text-gray-400 text-sm text-center mt-1">
          Games are added by coaches on the web dashboard.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={games}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16 }}
      renderItem={({ item: game }) => (
        <TouchableOpacity
          className="bg-white rounded-xl border border-gray-200 p-4 mb-3"
          onPress={() => {
            if (game.status === 'in_progress') {
              router.push({
                pathname: '/(tabs)/games/[gameId]/score',
                params: {
                  gameId: game.remoteId,
                  opponentName: game.opponentName || 'TBD',
                },
              });
            }
          }}
        >
          <View className="flex-row justify-between items-start mb-1">
            <Text className="font-semibold text-gray-900 text-base">vs {game.opponentName || 'TBD'}</Text>
            <StatusBadge status={game.status} />
          </View>
          <Text className="text-gray-500 text-sm">
            {formatDate(new Date(game.scheduledAt))} at {formatTime(new Date(game.scheduledAt))}
          </Text>
          {game.venueName && (
            <Text className="text-gray-400 text-xs mt-0.5">{game.venueName}</Text>
          )}
          {game.status === 'in_progress' && (
            <View className="mt-2 flex-row items-center gap-2">
              <View className="w-2 h-2 rounded-full bg-red-500" />
              <Text className="text-red-600 text-sm font-medium">
                {game.homeScore}–{game.awayScore} • Inning {game.currentInning}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-red-100 text-red-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-gray-100 text-gray-400',
    postponed: 'bg-yellow-100 text-yellow-700',
  };
  const labels: Record<string, string> = {
    scheduled: 'Scheduled',
    in_progress: 'Live',
    completed: 'Final',
    cancelled: 'Cancelled',
    postponed: 'Postponed',
  };

  return (
    <View className={`px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-gray-100'}`}>
      <Text className="text-xs font-medium">{labels[status] ?? status}</Text>
    </View>
  );
}

// Connect to WatermelonDB observable
const GamesListEnhanced = withObservables([], () => ({
  games: database
    .get<Game>('games')
    .query(Q.sortBy('scheduled_at', Q.asc))
    .observe(),
}))((GamesListobs: { games: Game[] }) => <GamesList games={GamesListobs.games} />);

export default function GamesScreen() {
  return (
    <View className="flex-1 bg-gray-50">
      <GamesListEnhanced />
    </View>
  );
}
