import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { listGameRsvps } from '@baseball/database';
import type { GameRsvp, GameRsvpStatus } from '@baseball/shared';
import { getSupabaseClient } from '../../../../src/lib/supabase';
import { useRole } from '../../../../src/providers/RoleProvider';

interface RosterRow {
  id: string;
  jersey_number: number | null;
  first_name: string;
  last_name: string;
}

function colorFor(status: GameRsvpStatus | 'pending') {
  switch (status) {
    case 'attending':
      return 'bg-green-600';
    case 'maybe':
      return 'bg-amber-500';
    case 'not_attending':
      return 'bg-gray-500';
    default:
      return 'bg-gray-300';
  }
}

function labelFor(status: GameRsvpStatus | 'pending') {
  switch (status) {
    case 'attending':
      return 'Going';
    case 'maybe':
      return 'Maybe';
    case 'not_attending':
      return 'Out';
    default:
      return 'Pending';
  }
}

export default function AttendanceScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { activeTeam, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<RosterRow[]>([]);
  const [byPlayer, setByPlayer] = useState<Map<string, GameRsvp>>(new Map());

  useEffect(() => {
    if (!gameId || !activeTeam) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = getSupabaseClient();
      try {
        const [{ data: rosterData, error: rosterErr }, records] = await Promise.all([
          supabase
            .from('players')
            .select('id, jersey_number, first_name, last_name')
            .eq('team_id', activeTeam.teamId)
            .eq('is_active', true)
            .order('jersey_number', { ascending: true, nullsFirst: false }),
          listGameRsvps(supabase, gameId),
        ]);
        if (cancelled) return;
        if (rosterErr) {
          console.warn('roster fetch failed', rosterErr);
        }
        setPlayers(((rosterData ?? []) as unknown) as RosterRow[]);
        setByPlayer(new Map(records.map((r) => [r.playerId, r])));
      } catch (err) {
        console.warn('attendance load failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gameId, activeTeam?.teamId]);

  if (roleLoading || loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </View>
    );
  }

  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <Text className="text-gray-600 text-center">Only coaches can view RSVPs.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'RSVPs' }} />
      <FlatList
        className="bg-gray-50"
        contentContainerStyle={{ padding: 16 }}
        data={players}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const rsvp = byPlayer.get(item.id);
          const status = rsvp?.status ?? 'pending';
          return (
            <View className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2 flex-row items-center">
              <Text className="w-12 font-semibold text-gray-900">
                #{item.jersey_number ?? '--'}
              </Text>
              <View className="flex-1">
                <Text className="text-gray-900">
                  {item.first_name} {item.last_name}
                </Text>
                {rsvp?.note && (
                  <Text className="text-xs text-gray-400 italic mt-0.5" numberOfLines={1}>
                    &ldquo;{rsvp.note}&rdquo;
                  </Text>
                )}
              </View>
              <View className={`px-2 py-1 rounded ${colorFor(status)}`}>
                <Text className="text-xs font-semibold text-white">{labelFor(status)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Text className="text-gray-500">No active players on this roster.</Text>
          </View>
        }
      />
    </>
  );
}
