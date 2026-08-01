import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import { withObservables } from '@nozbe/with-observables';
import { database } from '../../../src/db';
import type { Game } from '../../../src/db/models/Game';
import { formatDate, formatTime } from '@baseball/shared';
import { useAuth } from '../../../src/providers/AuthProvider';
import { getSupabaseClient } from '../../../src/lib/supabase';

interface GamesListProps {
  games: Game[];
}

function GamesList({ games }: GamesListProps) {
  const { user } = useAuth();
  const [rsvps, setRsvps] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || games.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await getSupabaseClient()
        .from('game_rsvps')
        .select('game_id, status')
        .eq('user_id', user.id)
        .in('game_id', games.map((game) => game.remoteId));
      if (error || cancelled) return;
      setRsvps(
        Object.fromEntries((data ?? []).map((row) => [row.game_id, row.status])),
      );
    })().catch((error) => console.warn('Failed to load game RSVPs', error));
    return () => {
      cancelled = true;
    };
  }, [games, user]);

  async function saveRsvp(gameId: string, status: 'attending' | 'maybe' | 'not_attending') {
    if (!user) return;
    const previous = rsvps[gameId];
    setRsvps((current) => ({ ...current, [gameId]: status }));
    const { error } = await getSupabaseClient().from('game_rsvps').upsert(
      { game_id: gameId, user_id: user.id, status },
      { onConflict: 'game_id,user_id' },
    );
    if (error) {
      setRsvps((current) => ({ ...current, [gameId]: previous ?? '' }));
      console.warn('Failed to save game RSVP', error);
    }
  }

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
                  teamId: game.teamId,
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
          {user && game.status === 'scheduled' && (
            <View className="mt-3 flex-row gap-2">
              {([
                ['attending', 'Going'],
                ['maybe', 'Maybe'],
                ['not_attending', 'Can’t go'],
              ] as const).map(([status, label]) => (
                <TouchableOpacity
                  key={status}
                  className={`rounded-lg border px-2.5 py-1.5 ${
                    rsvps[game.remoteId] === status
                      ? 'border-brand-700 bg-brand-700'
                      : 'border-gray-300 bg-gray-50'
                  }`}
                  onPress={() => saveRsvp(game.remoteId, status)}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      rsvps[game.remoteId] === status ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
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
