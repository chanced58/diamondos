import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, SectionList, TouchableOpacity } from 'react-native';
import { Stack, router } from 'expo-router';
import { Q } from '@nozbe/watermelondb';
import { database } from '../../../../src/db';
import type { Player } from '../../../../src/db/models/Player';
import { useRole } from '../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
import { POSITION_ABBREVIATIONS } from '@baseball/shared';

/** Team staff who open every player's page without managing the roster (as on the web). */
const STAFF_VIEWER_ROLES = ['scorekeeper', 'staff'];

function openPlayer(player: Player) {
  router.push({ pathname: '/(tabs)/more/roster/[playerId]', params: { playerId: player.remoteId } });
}

function PlayerRow({ player, canOpen, dimmed }: { player: Player; canOpen: boolean; dimmed?: boolean }) {
  const body = (
    <View className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2 flex-row items-center">
      <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${dimmed ? 'bg-gray-100' : 'bg-brand-100'}`}>
        <Text className={`font-bold ${dimmed ? 'text-gray-400' : 'text-brand-700'}`}>
          {player.jerseyNumber != null ? `#${player.jerseyNumber}` : '?'}
        </Text>
      </View>
      <View className="flex-1">
        <Text className={`font-semibold ${dimmed ? 'text-gray-500' : 'text-gray-900'}`}>{player.fullName}</Text>
        <Text className="text-gray-500 text-sm">
          {player.primaryPosition ? POSITION_ABBREVIATIONS[player.primaryPosition] : 'No position'}
        </Text>
      </View>
      {canOpen && <Text className="text-gray-300 text-lg">›</Text>}
    </View>
  );
  if (!canOpen) return body;
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${player.fullName}`} onPress={() => openPlayer(player)}>
      {body}
    </TouchableOpacity>
  );
}

/** The team's players from the offline mirror, active or disabled, last name first. */
function useTeamPlayers(teamId: string | null, active: boolean): Player[] {
  const [players, setPlayers] = useState<Player[]>([]);
  useEffect(() => {
    if (!teamId) {
      setPlayers([]);
      return;
    }
    const subscription = database
      .get<Player>('players')
      .query(Q.where('team_id', teamId), Q.where('is_active', active), Q.sortBy('last_name', Q.asc))
      .observe()
      .subscribe({
        next: setPlayers,
        error: (err) => console.warn(`[roster] players observe failed team=${teamId} active=${active}:`, err),
      });
    return () => subscription.unsubscribe();
  }, [teamId, active]);
  return players;
}

export default function RosterScreen() {
  // The local players table also mirrors league-pool identities (guests and
  // other teams' players, for the offline guest picker), so the roster must
  // scope to a team. It follows the active team, like the other team-scoped tabs.
  const { activeTeam, loading } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const players = useTeamPlayers(teamId, true);
  const disabledPlayers = useTeamPlayers(teamId, false);
  const [showDisabled, setShowDisabled] = useState(false);

  // Who opens which player page mirrors the server's rule: coaches and staff
  // every player, a player their own page. Parents see the list.
  const isCoach = activeTeam?.isCoach ?? false;
  const seesEveryPlayer = isCoach || STAFF_VIEWER_ROLES.includes(activeTeam?.role ?? '');
  const canOpen = (player: Player) => seesEveryPlayer || player.remoteId === activeTeam?.playerId;

  const header = (
    <Stack.Screen
      options={{
        headerRight: isCoach
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Add player"
                onPress={() => router.push('/(tabs)/more/roster/new')}
                hitSlop={12}
              >
                <Text className="text-white text-2xl font-light">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }

  const sections = [
    { key: 'active', title: null as string | null, data: players },
    ...(isCoach && disabledPlayers.length > 0
      ? [{ key: 'disabled', title: `Disabled players (${disabledPlayers.length})`, data: showDisabled ? disabledPlayers : [] }]
      : []),
  ];

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <TeamSwitcher />
      {players.length === 0 && disabledPlayers.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 text-base">No players loaded yet.</Text>
          <Text className="text-gray-400 text-sm mt-1">{isCoach ? 'Tap + to add one, or sync to load your roster.' : 'Sync to load your roster.'}</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: 16 }}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded: showDisabled }}
                onPress={() => setShowDisabled((shown) => !shown)}
                className="flex-row items-center justify-between mt-4 mb-2"
              >
                <Text className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{section.title}</Text>
                <Text className="text-sm text-gray-500">{showDisabled ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item, section }) => <PlayerRow player={item} canOpen={canOpen(item)} dimmed={section.key === 'disabled'} />}
        />
      )}
    </View>
  );
}
