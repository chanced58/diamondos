import { useEffect, useState } from 'react';
import { View, Text, FlatList } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../src/db';
import type { Game } from '../../../src/db/models/Game';
import type { Channel } from '../../../src/db/models/Channel';
import type { Player } from '../../../src/db/models/Player';
import { POSITION_ABBREVIATIONS } from '@baseball/shared';

function RosterList({ players }: { players: Player[] }) {
  if (players.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-400 text-base">No players loaded yet.</Text>
        <Text className="text-gray-400 text-sm mt-1">Sync to load your roster.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={players}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: 16 }}
      renderItem={({ item: player }) => (
        <View className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2 flex-row items-center">
          <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center mr-3">
            <Text className="text-brand-700 font-bold">
              {player.jerseyNumber !== undefined ? `#${player.jerseyNumber}` : '?'}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-gray-900">{player.fullName}</Text>
            <Text className="text-gray-500 text-sm">
              {player.primaryPosition
                ? POSITION_ABBREVIATIONS[player.primaryPosition]
                : 'No position'}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

export default function RosterScreen() {
  // The local players table also mirrors league-pool identities (guests and
  // other teams' players, for the offline guest picker), so the roster tab
  // must scope to the user's own team(s). Those team ids are derived from the
  // locally synced games and channels — both are RLS-scoped to the user's
  // memberships on the server.
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    let playersSubscription: { unsubscribe: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const [games, channels] = await Promise.all([
        database.get<Game>('games').query().fetch(),
        database.get<Channel>('channels').query().fetch(),
      ]);
      if (cancelled) return;
      const myTeamIds = [
        ...new Set([...games.map((g) => g.teamId), ...channels.map((c) => c.teamId)]),
      ].filter(Boolean);

      playersSubscription = database
        .get<Player>('players')
        .query(
          Q.where('team_id', Q.oneOf(myTeamIds)),
          Q.where('is_active', true),
          Q.sortBy('last_name', Q.asc),
        )
        .observe()
        .subscribe(setPlayers);
    })();

    return () => {
      cancelled = true;
      playersSubscription?.unsubscribe();
    };
  }, []);

  return (
    <View className="flex-1 bg-gray-50">
      <RosterList players={players} />
    </View>
  );
}
