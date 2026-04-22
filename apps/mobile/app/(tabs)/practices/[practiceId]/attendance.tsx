import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import {
  listPracticeAttendance,
  upsertPracticeAttendance,
} from '@baseball/database';
import type { PracticeAttendance, PracticeAttendanceStatus } from '@baseball/shared';
import { getSupabaseClient } from '../../../../src/lib/supabase';
import { useAuth } from '../../../../src/providers/AuthProvider';
import { useRole } from '../../../../src/providers/RoleProvider';

interface RosterRow {
  id: string;
  jersey_number: number | null;
  first_name: string;
  last_name: string;
}

const CYCLE: PracticeAttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

function colorFor(status: string) {
  switch (status) {
    case 'present':
      return 'bg-green-600';
    case 'late':
      return 'bg-amber-500';
    case 'absent':
      return 'bg-red-600';
    case 'excused':
      return 'bg-blue-600';
    default:
      return 'bg-gray-400';
  }
}

export default function AttendanceScreen() {
  const { practiceId } = useLocalSearchParams<{ practiceId: string }>();
  const { user } = useAuth();
  const { activeTeam, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [players, setPlayers] = useState<RosterRow[]>([]);
  const [byPlayer, setByPlayer] = useState<Map<string, PracticeAttendance>>(new Map());

  useEffect(() => {
    if (!practiceId || !activeTeam) {
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
          listPracticeAttendance(supabase, practiceId),
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
  }, [practiceId, activeTeam?.teamId]);

  const cycle = useCallback(
    async (playerId: string) => {
      if (!user || !practiceId) return;
      const current = byPlayer.get(playerId)?.status;
      const nextIdx = current ? (CYCLE.indexOf(current) + 1) % CYCLE.length : 0;
      const nextStatus = CYCLE[nextIdx];

      const previous = byPlayer;
      setByPlayer((m) => {
        const copy = new Map(m);
        const existing = copy.get(playerId);
        copy.set(playerId, {
          id: existing?.id ?? 'optimistic',
          practiceId,
          playerId,
          status: nextStatus,
          checkedInAt:
            nextStatus === 'present' || nextStatus === 'late'
              ? new Date().toISOString()
              : null,
          checkedInBy: user.id,
          notes: existing?.notes ?? null,
          createdAt: existing?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return copy;
      });

      try {
        const saved = await upsertPracticeAttendance(getSupabaseClient(), {
          practiceId,
          playerId,
          status: nextStatus,
          checkedInBy: user.id,
        });
        setByPlayer((m) => {
          const copy = new Map(m);
          copy.set(playerId, saved);
          return copy;
        });
      } catch (err) {
        console.warn('attendance upsert failed', err);
        setByPlayer(previous);
      }
    },
    [byPlayer, practiceId, user],
  );

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
        <Text className="text-gray-600 text-center">
          Only coaches can take attendance.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Attendance' }} />
      <FlatList
        className="bg-gray-50"
        contentContainerStyle={{ padding: 16 }}
        data={players}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => {
          const status = byPlayer.get(item.id)?.status ?? 'pending';
          return (
            <Pressable
              onPress={() => cycle(item.id)}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2 flex-row items-center"
            >
              <Text className="w-12 font-semibold text-gray-900">
                #{item.jersey_number ?? '--'}
              </Text>
              <Text className="flex-1 text-gray-900">
                {item.first_name} {item.last_name}
              </Text>
              <View className={`px-2 py-1 rounded ${colorFor(status)}`}>
                <Text className="text-xs font-semibold text-white capitalize">
                  {status}
                </Text>
              </View>
            </Pressable>
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
