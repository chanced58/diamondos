import { Link, Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { getSupabaseClient } from '../../../src/lib/supabase';
import { useRole } from '../../../src/providers/RoleProvider';

interface PracticeRow {
  id: string;
  scheduled_at: string;
  location: string | null;
  run_status: string;
}

const PRACTICES_FETCH_ERROR = "Couldn't load practices.";

export default function PracticesIndex() {
  const { activeTeam, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PracticeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const unmountedRef = useRef(false);

  const load = useCallback(async () => {
    if (!activeTeam) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error: fetchError } = await supabase
        .from('practices')
        .select('id, scheduled_at, location, run_status')
        .eq('team_id', activeTeam.teamId)
        .gte('scheduled_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order('scheduled_at', { ascending: true });
      if (unmountedRef.current) return;
      if (fetchError) {
        console.warn('practices fetch failed', fetchError);
        setRows([]);
        setError(PRACTICES_FETCH_ERROR);
      } else {
        setRows((data ?? []) as unknown as PracticeRow[]);
        setError(null);
      }
    } catch (err) {
      console.warn('practices fetch failed', err);
      if (!unmountedRef.current) {
        setRows([]);
        setError(PRACTICES_FETCH_ERROR);
      }
    } finally {
      if (!unmountedRef.current) {
        setLoading(false);
      }
    }
  }, [activeTeam?.teamId]);

  useEffect(() => {
    unmountedRef.current = false;
    load();
    return () => {
      unmountedRef.current = true;
    };
  }, [load]);

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

  if (error) {
    return (
      <>
        <Stack.Screen options={{ title: 'Practices' }} />
        <View className="flex-1 items-center justify-center bg-gray-50 px-6">
          <View className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
          <TouchableOpacity
            className="px-4 py-2 rounded-lg bg-white border border-gray-200"
            onPress={() => {
              load();
            }}
          >
            <Text className="text-sm font-semibold text-gray-700">Try again</Text>
          </TouchableOpacity>
        </View>
      </>
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
            ? ({
                pathname: '/(tabs)/practices/[practiceId]/attendance',
                params: { practiceId: item.id },
              } as const)
            : ({
                pathname: '/(tabs)/practices/[practiceId]/card',
                params: { practiceId: item.id },
              } as const);
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
