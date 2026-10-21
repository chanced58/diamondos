import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, FlatList } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../../src/db';
import type { Player } from '../../../../src/db/models/Player';
import { useRole } from '../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
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
  // other teams' players, for the offline guest picker), so the roster must
  // scope to a team. It used to merge every team the user belongs to; it now
  // follows the active team, like the other team-scoped tabs.
  const { activeTeam, loading } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!teamId) {
      setPlayers([]);
      return;
    }
    const subscription = database
      .get<Player>('players')
      .query(
        Q.where('team_id', teamId),
        Q.where('is_active', true),
        Q.sortBy('last_name', Q.asc),
      )
      .observe()
      .subscribe({
        next: setPlayers,
        error: (err) => console.warn(`[roster] players observe failed team=${teamId}:`, err),
      });
    return () => subscription.unsubscribe();
  }, [teamId]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <TeamSwitcher />
      <RosterList players={players} />
    </View>
  );
}
