import { Stack, Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { getSupabaseClient } from '../../src/lib/supabase';
import { useRole } from '../../src/providers/RoleProvider';

type ScheduleItem = {
  id: string;
  kind: 'game' | 'practice' | 'event';
  startsAt: string;
  title: string;
  detail: string | null;
  href?: string;
};

export default function ScheduleScreen() {
  const { activeTeam, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduleItem[]>([]);

  useEffect(() => {
    if (!activeTeam) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [games, practices, events] = await Promise.all([
        supabase
          .from('games')
          .select('id, scheduled_at, opponent_name, status')
          .eq('team_id', activeTeam.teamId)
          .gte('scheduled_at', since)
          .order('scheduled_at'),
        supabase
          .from('practices')
          .select('id, scheduled_at, location, run_status')
          .eq('team_id', activeTeam.teamId)
          .gte('scheduled_at', since)
          .order('scheduled_at'),
        supabase
          .from('team_events')
          .select('id, starts_at, title, location')
          .eq('team_id', activeTeam.teamId)
          .gte('starts_at', since)
          .order('starts_at'),
      ]);
      if (cancelled) return;
      if (games.error || practices.error || events.error) {
        console.warn('schedule fetch failed', {
          games: games.error?.message,
          practices: practices.error?.message,
          events: events.error?.message,
        });
      }
      const next: ScheduleItem[] = [
        ...(games.data ?? []).map((game) => ({
          id: `game:${game.id}`,
          kind: 'game' as const,
          startsAt: game.scheduled_at,
          title: `Game vs ${game.opponent_name ?? 'TBD'}`,
          detail: game.status,
          href: game.status === 'in_progress'
            ? `/(tabs)/games/[gameId]/score?gameId=${game.id}&teamId=${activeTeam.teamId}`
            : undefined,
        })),
        ...(practices.data ?? []).map((practice) => ({
          id: `practice:${practice.id}`,
          kind: 'practice' as const,
          startsAt: practice.scheduled_at,
          title: 'Practice',
          detail: practice.location ?? practice.run_status,
        })),
        ...(events.data ?? []).map((event) => ({
          id: `event:${event.id}`,
          kind: 'event' as const,
          startsAt: event.starts_at,
          title: event.title,
          detail: event.location,
        })),
      ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      setItems(next);
      setLoading(false);
    })().catch((error) => {
      console.warn('schedule fetch failed', error);
      if (!cancelled) {
        setItems([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTeam?.teamId]);

  if (roleLoading || loading) {
    return <View className="flex-1 items-center justify-center bg-gray-50"><ActivityIndicator /></View>;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Schedule' }} />
      <FlatList
        className="bg-gray-50"
        contentContainerStyle={{ padding: 16 }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const card = (
            <View className="mb-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
              <Text className="text-xs font-semibold uppercase text-gray-500">{item.kind}</Text>
              <Text className="mt-1 font-semibold text-gray-900">{item.title}</Text>
              <Text className="mt-1 text-sm text-gray-600">
                {new Date(item.startsAt).toLocaleString()}
              </Text>
              {item.detail ? <Text className="mt-1 text-xs text-gray-500">{item.detail}</Text> : null}
            </View>
          );
          return item.href ? <Link href={item.href as never}>{card}</Link> : card;
        }}
        ListEmptyComponent={<Text className="py-10 text-center text-gray-500">No upcoming events.</Text>}
      />
    </>
  );
}
