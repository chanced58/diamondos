import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { buildPlayerRotationView, type PlayerRotationStep } from '@baseball/shared';
import { getPracticeWithBlocks } from '@baseball/database';
import { getSupabaseClient } from '../../../../src/lib/supabase';
import { useRole } from '../../../../src/providers/RoleProvider';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function PlayerCardScreen() {
  const { practiceId } = useLocalSearchParams<{ practiceId: string }>();
  const { activeTeam, loading: roleLoading } = useRole();
  const [steps, setSteps] = useState<PlayerRotationStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);

  useEffect(() => {
    if (!practiceId || !activeTeam) {
      setLoading(false);
      return;
    }
    if (!activeTeam.playerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const tree = await getPracticeWithBlocks(getSupabaseClient(), practiceId);
        if (cancelled) return;
        if (tree) {
          setScheduledAt(tree.scheduledAt);
          setSteps(buildPlayerRotationView(tree, activeTeam.playerId!));
        } else {
          setSteps([]);
        }
      } catch (err) {
        console.warn('practice fetch failed', err);
        setSteps([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [practiceId, activeTeam?.playerId]);

  if (roleLoading || loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </View>
    );
  }

  if (!activeTeam?.playerId) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <Text className="text-gray-600 text-center">
          You are not on this team's roster, so there's nothing to show here.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'My Practice' }} />
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
        {scheduledAt ? (
          <View className="mb-4">
            <Text className="text-xs uppercase text-gray-500 tracking-wider">Practice</Text>
            <Text className="text-lg font-semibold text-gray-900">
              {new Date(scheduledAt).toLocaleString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        ) : null}

        {steps.length === 0 ? (
          <View className="items-center justify-center py-10">
            <Text className="text-gray-500 text-center">
              You don't have any blocks assigned in this practice.
            </Text>
          </View>
        ) : (
          steps.map((s, idx) => (
            <View
              key={`${s.blockId}-${s.rotationIndex ?? 'solo'}-${idx}`}
              className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2"
            >
              <Text className="text-xs text-gray-500">
                {formatTime(s.startsAt)} – {formatTime(s.endsAt)}
              </Text>
              <Text className="text-lg font-semibold text-gray-900 mt-1">{s.blockTitle}</Text>
              {s.stationName ? (
                <Text className="text-base text-brand-700 mt-0.5">{s.stationName}</Text>
              ) : null}
              {s.stationNotes ? (
                <Text className="text-sm text-gray-700 mt-1">{s.stationNotes}</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}
