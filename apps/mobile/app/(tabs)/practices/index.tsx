import { Link, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { getSupabaseClient } from '../../../src/lib/supabase';
import { useRole } from '../../../src/providers/RoleProvider';

interface PracticeRow {
  id: string;
  scheduled_at: string;
  location: string | null;
  run_status: string;
}

export default function PracticesIndex() {
  const { activeTeam, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PracticeRow[]>([]);

  useEffect(() => {
    if (!activeTeam) {
      setRows([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('practices')
        .select('id, scheduled_at, location, run_status')
        .eq('team_id', activeTeam.teamId)
        .gte('scheduled_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order('scheduled_at', { ascending: true });
      if (cancelled) return;
      if (error) {
        console.warn('practices fetch failed', error);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as PracticeRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTeam?.teamId]);

  if (roleLoading || loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator />
      </View>
    );
  }

  if (!activeTeam) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 p-4">
        <Text className="text-gray-500">No team selected.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Practices' }} />
      <FlatList
        className="bg-gray-50"
        contentContainerStyle={{ padding: 16 }}
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const dest = activeTeam.isCoach
            ? `/(tabs)/practices/${item.id}/attendance`
            : `/(tabs)/practices/${item.id}/card`;
          return (
            <Link href={dest} asChild>
              <View className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-2">
                <Text className="font-semibold text-gray-900">
                  {new Date(item.scheduled_at).toLocaleString()}
                </Text>
                {item.location ? (
                  <Text className="text-gray-600 text-sm mt-1">{item.location}</Text>
                ) : null}
                <Text className="text-xs text-gray-500 mt-1 capitalize">
                  {item.run_status.replace('_', ' ')}
                </Text>
              </View>
            </Link>
          );
        }}
        ListEmptyComponent={
          <View className="items-center justify-center py-10">
            <Text className="text-gray-500">No upcoming practices.</Text>
          </View>
        }
      />
    </>
  );
}
