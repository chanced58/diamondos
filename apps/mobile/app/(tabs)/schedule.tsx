import { Q } from '@nozbe/watermelondb';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { database, Game } from '../../src/db';
import { getSupabaseClient } from '../../src/lib/supabase';
import { useRole } from '../../src/providers/RoleProvider';
import {
  buildScheduleState,
  SCHEDULE_FULL_PAGE_ERROR,
  type ScheduleEventRow,
  type ScheduleFetchOutcome,
  type ScheduleGameRow,
  type ScheduleItem,
  type SchedulePracticeRow,
} from '../../src/features/schedule/schedule-data';

export default function ScheduleScreen() {
  const { activeTeam, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [fullPageError, setFullPageError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const unmountedRef = useRef(false);

  const load = useCallback(async () => {
    if (!activeTeam) {
      setItems([]);
      setFullPageError(null);
      setPartialError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Whatever goes wrong below — including a Supabase call that rejects
    // outright rather than resolving with { error } — this must land on the
    // full-page error state and clear the spinner, not swallow the failure
    // or leave the screen stuck loading forever on a Retry press.
    try {
      const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
      const sinceIso = new Date(sinceMs).toISOString();

      // Games are mirrored locally by the sync engine, so read them from
      // WatermelonDB instead of Supabase — this is the one source on this
      // screen that keeps working offline. practices and team_events are
      // not in the sync engine's pull payload (see sync-engine.ts) and stay
      // online-only.
      let games: ScheduleFetchOutcome<ScheduleGameRow>;
      try {
        const rows = await database
          .get<Game>('games')
          .query(
            Q.where('team_id', activeTeam.teamId),
            Q.where('scheduled_at', Q.gte(sinceMs)),
            Q.sortBy('scheduled_at', Q.asc),
          )
          .fetch();
        games = {
          data: rows.map((g) => ({
            remoteId: g.remoteId,
            teamId: g.teamId,
            opponentName: g.opponentName,
            scheduledAt: g.scheduledAt,
            status: g.status,
          })),
          failed: false,
        };
      } catch (error) {
        console.warn('schedule games fetch failed', error);
        games = { data: [], failed: true };
      }

      const supabase = getSupabaseClient();
      const [practicesResult, eventsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('id, scheduled_at, location, run_status')
          .eq('team_id', activeTeam.teamId)
          .gte('scheduled_at', sinceIso)
          .order('scheduled_at'),
        supabase
          .from('team_events')
          .select('id, starts_at, title, location')
          .eq('team_id', activeTeam.teamId)
          .gte('starts_at', sinceIso)
          .order('starts_at'),
      ]);
      if (practicesResult.error || eventsResult.error) {
        console.warn('schedule online fetch failed', {
          practices: practicesResult.error?.message,
          events: eventsResult.error?.message,
        });
      }
      const practices: ScheduleFetchOutcome<SchedulePracticeRow> = {
        data: (practicesResult.data ?? []) as unknown as SchedulePracticeRow[],
        failed: Boolean(practicesResult.error),
      };
      const events: ScheduleFetchOutcome<ScheduleEventRow> = {
        data: (eventsResult.data ?? []) as unknown as ScheduleEventRow[],
        failed: Boolean(eventsResult.error),
      };

      const state = buildScheduleState({ games, practices, events });
      if (unmountedRef.current) return;
      setItems(state.items);
      setFullPageError(state.fullPageError);
      setPartialError(state.partialError);
    } catch (error) {
      console.warn('schedule fetch failed', error);
      if (unmountedRef.current) return;
      setItems([]);
      setFullPageError(SCHEDULE_FULL_PAGE_ERROR);
      setPartialError(null);
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
    return <View className="flex-1 items-center justify-center bg-gray-50"><ActivityIndicator /></View>;
  }

  if (fullPageError) {
    return (
      <>
        <Stack.Screen options={{ title: 'Schedule' }} />
        <View className="flex-1 items-center justify-center bg-gray-50 px-6">
          <View className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <Text className="text-sm text-red-700">{fullPageError}</Text>
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
      <Stack.Screen options={{ title: 'Schedule' }} />
      <FlatList
        className="bg-gray-50"
        contentContainerStyle={{ padding: 16 }}
        data={items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          partialError ? (
            <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 flex-row items-center justify-between">
              <Text className="text-xs text-red-700 flex-1 mr-2">{partialError}</Text>
              <TouchableOpacity
                onPress={() => {
                  load();
                }}
              >
                <Text className="text-xs font-semibold text-red-700">Try again</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const content = (
            <>
              <Text className="text-xs font-semibold uppercase text-gray-500">{item.kind}</Text>
              <Text className="mt-1 font-semibold text-gray-900">{item.title}</Text>
              <Text className="mt-1 text-sm text-gray-600">
                {new Date(item.startsAt).toLocaleString()}
              </Text>
              {item.detail ? <Text className="mt-1 text-xs text-gray-500">{item.detail}</Text> : null}
            </>
          );
          if (!item.href) {
            return (
              <View className="mb-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
                {content}
              </View>
            );
          }
          return (
            <TouchableOpacity
              className="mb-2 rounded-xl border border-gray-200 bg-white px-4 py-3"
              onPress={() => router.push(item.href!)}
            >
              {content}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text className="py-10 text-center text-gray-500">No upcoming events.</Text>}
      />
    </>
  );
}
