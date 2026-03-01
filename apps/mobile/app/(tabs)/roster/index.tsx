import { View, Text, FlatList } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { withObservables } from '@nozbe/with-observables';
import { database } from '../../../src/db';
import type { Player } from '../../../src/db/models/Player';
import { POSITION_ABBREVIATIONS } from '@baseball/shared';

interface RosterProps {
  players: Player[];
}

function RosterList({ players }: RosterProps) {
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

const RosterListEnhanced = withObservables([], () => ({
  players: database
    .get<Player>('players')
    .query(Q.where('is_active', true), Q.sortBy('last_name', Q.asc))
    .observe(),
}))((props: { players: Player[] }) => <RosterList players={props.players} />);

export default function RosterScreen() {
  return (
    <View className="flex-1 bg-gray-50">
      <RosterListEnhanced />
    </View>
  );
}
