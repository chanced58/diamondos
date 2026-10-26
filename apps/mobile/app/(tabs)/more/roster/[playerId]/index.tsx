import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import type { RosterPlayer } from '@baseball/shared';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { useSyncContext } from '../../../../../src/providers/SyncProvider';
import { ListGroup } from '../../../../../src/features/navigation/ListGroup';
import {
  deactivateRosterPlayer,
  reactivateRosterPlayer,
  rosterPlayerQueryKey,
  useRosterPlayer,
} from '../../../../../src/features/roster/roster-api';
import { HAND_LABELS, POSITION_LABELS, POSITION_SHORT_LABELS } from '../../../../../src/features/roster/player-form-model';
import { describeApiError } from '../../../../../src/lib/api-client';
import { openOnWeb, webUrl } from '../../../../../src/lib/web-links';

const handLabel = (hand: string | null) => (hand ? HAND_LABELS[hand as keyof typeof HAND_LABELS] ?? hand : null);
const positionLabel = (position: string | null) => (position ? POSITION_LABELS[position as keyof typeof POSITION_LABELS] ?? position : null);

/**
 * A player on the active team (the web player page's profile): positions,
 * handedness, graduation year and contact. Roster managers edit them, keep
 * their availability flags, and deactivate or reactivate them; stats, notes
 * and documents stay on the web page.
 */
export default function PlayerScreen() {
  const { playerId = '' } = useLocalSearchParams<{ playerId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const query = useRosterPlayer(teamId, playerId);
  const queryClient = useQueryClient();
  const { triggerSync } = useSyncContext();
  const [jersey, setJersey] = useState('');

  const afterWrite = () => {
    void queryClient.invalidateQueries({ queryKey: rosterPlayerQueryKey(teamId ?? '', playerId) });
    void triggerSync();
  };
  const deactivate = useMutation({
    mutationFn: () => deactivateRosterPlayer(teamId as string, playerId),
    onSuccess: afterWrite,
    onError: (error) => Alert.alert('Couldn’t deactivate the player', describeApiError(error)),
  });
  const reactivate = useMutation({
    mutationFn: (jerseyNumber: number | null) => reactivateRosterPlayer(teamId as string, playerId, jerseyNumber),
    onSuccess: () => {
      setJersey('');
      afterWrite();
    },
    onError: (error) => Alert.alert('Couldn’t reactivate the player', describeApiError(error)),
  });

  const player = query.data?.player;
  const header = <Stack.Screen options={{ title: player ? `${player.firstName} ${player.lastName}` : 'Player' }} />;
  if (query.isPending && teamId) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data || !player) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {teamId ? (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState title="No team" message="Join a team to see its roster." />
        )}
      </View>
    );
  }

  const canManage = query.data.canManage;
  const confirmDeactivate = () =>
    Alert.alert(`Deactivate ${player.firstName} ${player.lastName}?`, 'They leave the active roster and lose their jersey number. Stats and history are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => deactivate.mutate() },
    ]);
  const submitReactivate = () => {
    const trimmed = jersey.trim();
    if (trimmed !== '' && !/^\d{1,2}$/.test(trimmed)) {
      Alert.alert('Check the jersey number', 'Jersey numbers run 0–99.');
      return;
    }
    reactivate.mutate(trimmed === '' ? null : Number(trimmed));
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      <ProfileHeader player={player} />

      {!player.isActive && (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-4">
          <Text className="text-sm font-semibold text-amber-900">This player is disabled</Text>
          <Text className="text-sm text-amber-900 mt-1">
            Stats and history are preserved.
            {player.disabledAt ? ` Disabled on ${new Date(player.disabledAt).toLocaleDateString()}.` : ''}
          </Text>
          {canManage && (
            <View className="flex-row items-center gap-2 mt-3">
              <TextInput
                accessibilityLabel="Jersey number"
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white text-base"
                keyboardType="number-pad"
                placeholder="Jersey #"
                placeholderTextColor="#9ca3af"
                value={jersey}
                onChangeText={setJersey}
                maxLength={2}
              />
              <View className="flex-1">
                <Button label="Reactivate" loading={reactivate.isPending} onPress={submitReactivate} />
              </View>
            </View>
          )}
        </View>
      )}

      {(player.email || player.phone) && (
        <>
          <SectionHeader title="Contact" />
          <ListGroup>
            {player.email && <ListRow title={player.email} subtitle="Email" onPress={() => void Linking.openURL(`mailto:${player.email}`)} showChevron={false} />}
            {player.phone && <ListRow title={player.phone} subtitle="Phone" onPress={() => void Linking.openURL(`tel:${player.phone}`)} showChevron={false} />}
          </ListGroup>
        </>
      )}

      {canManage && player.isActive && (
        <>
          <SectionHeader title="Manage" />
          <ListGroup>
            <ListRow
              title="Edit player"
              subtitle="Name, number, positions and contact"
              onPress={() => router.push({ pathname: '/(tabs)/more/roster/[playerId]/edit', params: { playerId } })}
            />
            <ListRow
              title="Availability"
              subtitle="Injury and availability flags"
              onPress={() => router.push({ pathname: '/(tabs)/more/roster/[playerId]/availability', params: { playerId } })}
            />
          </ListGroup>
          <View className="mt-4">
            <Button label="Deactivate player" variant="danger" loading={deactivate.isPending} onPress={confirmDeactivate} />
          </View>
        </>
      )}

      {webUrl('/') !== null && (
        <View className="mt-4">
          <Button
            label="Stats and notes on the web"
            variant="ghost"
            onPress={() => void openOnWeb(`/teams/${teamId}/roster/${playerId}`)}
          />
        </View>
      )}
    </ScrollView>
  );
}

/** Name, number, positions and handedness, as the web page's header reads. */
function ProfileHeader({ player }: { player: RosterPlayer }) {
  const facts = [
    handLabel(player.bats) && `Bats ${handLabel(player.bats)}`,
    handLabel(player.throws) && `Throws ${handLabel(player.throws)}`,
    player.graduationYear != null && `Class of ${player.graduationYear}`,
  ].filter(Boolean);
  return (
    <View>
      <View className="flex-row items-baseline gap-2">
        <Text className="text-2xl font-bold text-gray-900">
          {player.firstName} {player.lastName}
        </Text>
        {player.jerseyNumber != null && <Text className="text-xl text-gray-400">#{player.jerseyNumber}</Text>}
      </View>
      {player.primaryPosition && <Text className="text-sm text-gray-700 mt-1">{positionLabel(player.primaryPosition)}</Text>}
      {player.secondaryPositions.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mt-2">
          {player.secondaryPositions.map((position) => (
            <Badge key={position} label={POSITION_SHORT_LABELS[position as keyof typeof POSITION_SHORT_LABELS] ?? position} />
          ))}
        </View>
      )}
      {facts.length > 0 && <Text className="text-sm text-gray-500 mt-2">{facts.join(' · ')}</Text>}
    </View>
  );
}
