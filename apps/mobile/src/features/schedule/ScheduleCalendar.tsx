import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Q } from '@nozbe/watermelondb';
import { router, useFocusEffect } from 'expo-router';
import {
  buildMonthGrid,
  formatInTimeZone,
  monthOfDateKey,
  shiftMonth,
  utcToZonedDateTime,
  type CalendarMonth,
} from '@baseball/shared';
import { database, Game } from '../../db';
import { getSupabaseClient } from '../../lib/supabase';
import { useRole } from '../../providers/RoleProvider';
import { TournamentTag } from '../tournaments/TournamentTag';
import { deviceTimeZone } from '../games/game-form-model';
import {
  buildScheduleState,
  scheduleItemDateKey,
  SCHEDULE_FULL_PAGE_ERROR,
  type ScheduleEventRow,
  type ScheduleFetchOutcome,
  type ScheduleGameRow,
  type ScheduleItem,
  type ScheduleItemKind,
  type SchedulePracticeRow,
} from './schedule-data';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOT_CLASSES: Record<ScheduleItemKind, string> = {
  game: 'bg-blue-600',
  practice: 'bg-green-600',
  event: 'bg-amber-500',
};
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The active team's calendar (the web's month Schedule): a month grid with a
 * dot per game, practice and team event, and the selected day's agenda below.
 *
 * Games come from the offline mirror, so they show without a connection;
 * practices and team events are online-only reads. A source that fails shows
 * a banner rather than an empty month that reads as "nothing scheduled".
 */
export function ScheduleCalendar() {
  const { activeTeam, loading: roleLoading } = useRole();
  const zone = useMemo(() => deviceTimeZone(), []);
  const today = useMemo(() => utcToZonedDateTime(new Date(), zone).date, [zone]);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOfDateKey(today));
  const [selected, setSelected] = useState(today);
  const weeks = useMemo(() => buildMonthGrid(month), [month]);

  const range = useMemo(() => {
    const first = weeks[0][0].dateKey;
    const last = weeks[weeks.length - 1][6].dateKey;
    // A day of slack each side covers items whose own zone puts them on a
    // visible day while the device's zone would not.
    return { fromMs: Date.parse(`${first}T00:00:00Z`) - MS_PER_DAY, toMs: Date.parse(`${last}T23:59:59Z`) + MS_PER_DAY };
  }, [weeks]);

  const { items, loading, fullPageError, partialError, reload } = useScheduleRange(
    activeTeam?.teamId ?? null,
    range,
    activeTeam?.isCoach ?? false,
  );

  const itemsByDay = useMemo(() => {
    const byDay = new Map<string, ScheduleItem[]>();
    for (const item of items) {
      const key = scheduleItemDateKey(item, zone);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return byDay;
  }, [items, zone]);

  const goToMonth = (delta: number) => setMonth((current) => shiftMonth(current, delta));
  const goToToday = () => {
    setMonth(monthOfDateKey(today));
    setSelected(today);
  };

  if (roleLoading) return <Centered><ActivityIndicator /></Centered>;
  if (!activeTeam) return <Centered><Text className="text-gray-500">Join a team to see its schedule.</Text></Centered>;

  const monthTitle = formatInTimeZone(`${month.year}-${String(month.month).padStart(2, '0')}-15T12:00:00Z`, 'UTC', {
    month: 'long',
    year: 'numeric',
  });
  const dayItems = itemsByDay.get(selected) ?? [];
  const selectedTitle = formatInTimeZone(`${selected}T12:00:00Z`, 'UTC', { weekday: 'long', month: 'long', day: 'numeric' });

  const grid = (
    <View className="bg-white border-b border-gray-200 px-2 pb-2">
      <View className="flex-row items-center justify-between px-2 py-2">
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => goToMonth(-1)} hitSlop={8}>
          <Text className="text-2xl text-blue-700 px-2">‹</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go to today" onPress={goToToday}>
          <Text accessibilityRole="header" className="text-base font-semibold text-gray-900">{monthTitle}</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next month" onPress={() => goToMonth(1)} hitSlop={8}>
          <Text className="text-2xl text-blue-700 px-2">›</Text>
        </TouchableOpacity>
      </View>
      <View className="flex-row">
        {WEEKDAYS.map((day, index) => (
          <Text key={index} className="flex-1 text-center text-xs font-semibold text-gray-400">{day}</Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0].dateKey} className="flex-row">
          {week.map((cell) => {
            const kinds = [...new Set((itemsByDay.get(cell.dateKey) ?? []).map((item) => item.kind))];
            const isSelected = cell.dateKey === selected;
            const isToday = cell.dateKey === today;
            return (
              <TouchableOpacity
                key={cell.dateKey}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${cell.dateKey}${kinds.length ? `, ${kinds.join(', ')}` : ''}`}
                onPress={() => {
                  setSelected(cell.dateKey);
                  if (!cell.inMonth) setMonth(monthOfDateKey(cell.dateKey));
                }}
                className="flex-1 items-center py-1"
              >
                <View
                  className={`w-9 h-9 items-center justify-center rounded-full ${
                    isSelected ? 'bg-blue-700' : isToday ? 'border border-blue-700' : ''
                  }`}
                >
                  <Text
                    className={`text-sm ${isSelected ? 'text-white font-semibold' : cell.inMonth ? 'text-gray-900' : 'text-gray-300'}`}
                  >
                    {cell.day}
                  </Text>
                </View>
                <View className="flex-row gap-0.5 h-1.5 mt-0.5">
                  {kinds.map((kind) => (
                    <View key={kind} className={`w-1.5 h-1.5 rounded-full ${DOT_CLASSES[kind]}`} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-gray-50"
      data={loading || fullPageError ? [] : dayItems}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <>
          {grid}
          {partialError && !loading && (
            <View className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex-row items-center justify-between">
              <Text className="text-xs text-red-700 flex-1 mr-2">{partialError}</Text>
              <TouchableOpacity onPress={reload}>
                <Text className="text-xs font-semibold text-red-700">Try again</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{selectedTitle}</Text>
        </>
      }
      renderItem={({ item }) => <ScheduleItemCard item={item} />}
      contentContainerStyle={{ paddingBottom: 32 }}
      ListEmptyComponent={
        loading ? (
          <View className="py-8"><ActivityIndicator /></View>
        ) : fullPageError ? (
          <View className="mx-4 items-center">
            <View className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <Text className="text-sm text-red-700">{fullPageError}</Text>
            </View>
            <TouchableOpacity className="px-4 py-2 rounded-lg bg-white border border-gray-200" onPress={reload}>
              <Text className="text-sm font-semibold text-gray-700">Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text className="py-6 text-center text-gray-500">Nothing scheduled.</Text>
        )
      }
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center bg-gray-50 px-6">{children}</View>;
}

function ScheduleItemCard({ item }: { item: ScheduleItem }) {
  const content = (
    <>
      <View className="flex-row items-center gap-1.5">
        <View className={`w-2 h-2 rounded-full ${DOT_CLASSES[item.kind]}`} />
        <Text className="text-xs font-semibold uppercase text-gray-500">{item.kind}</Text>
        {item.tag === 'Tournament' ? <TournamentTag /> : null}
      </View>
      <Text className="mt-1 font-semibold text-gray-900">{item.title}</Text>
      <Text className="mt-0.5 text-sm text-gray-600">
        {formatInTimeZone(item.startsAt, item.timeZone, { hour: 'numeric', minute: '2-digit' })}
      </Text>
      {item.detail ? <Text className="mt-0.5 text-xs text-gray-500">{item.detail}</Text> : null}
    </>
  );
  const className = 'mx-4 mb-2 rounded-xl border border-gray-200 bg-white px-4 py-3';
  if (!item.href) return <View className={className}>{content}</View>;
  return (
    <TouchableOpacity accessibilityRole="button" className={className} onPress={() => router.push(item.href!)}>
      {content}
    </TouchableOpacity>
  );
}

/** Games (offline mirror), practices and team events between two instants. */
function useScheduleRange(teamId: string | null, range: { fromMs: number; toMs: number }, isCoach: boolean) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullPageError, setFullPageError] = useState<string | null>(null);
  const [partialError, setPartialError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!teamId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const fromIso = new Date(range.fromMs).toISOString();
      const toIso = new Date(range.toMs).toISOString();

      let games: ScheduleFetchOutcome<ScheduleGameRow>;
      try {
        const rows = await database
          .get<Game>('games')
          .query(
            Q.where('team_id', teamId),
            Q.where('scheduled_at', Q.between(range.fromMs, range.toMs)),
            Q.sortBy('scheduled_at', Q.asc),
          )
          .fetch();
        games = {
          data: rows.map((g) => ({
            remoteId: g.remoteId,
            teamId: g.teamId,
            opponentName: g.opponentName,
            scheduledAt: g.scheduledAt,
            timeZone: g.timeZone ?? null,
            status: g.status,
            tournamentId: g.tournamentId ?? null,
            locationType: g.locationType,
            neutralHomeTeam: g.neutralHomeTeam ?? null,
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
          .eq('team_id', teamId)
          .gte('scheduled_at', fromIso)
          .lte('scheduled_at', toIso)
          .order('scheduled_at'),
        supabase
          .from('team_events')
          .select('id, starts_at, title, location')
          .eq('team_id', teamId)
          .gte('starts_at', fromIso)
          .lte('starts_at', toIso)
          .order('starts_at'),
      ]);
      if (practicesResult.error || eventsResult.error) {
        console.warn('schedule online fetch failed', {
          practices: practicesResult.error?.message,
          events: eventsResult.error?.message,
        });
      }
      const state = buildScheduleState({
        games,
        practices: { data: (practicesResult.data ?? []) as SchedulePracticeRow[], failed: Boolean(practicesResult.error) },
        events: { data: (eventsResult.data ?? []) as ScheduleEventRow[], failed: Boolean(eventsResult.error) },
        isCoach,
      });
      if (requestId !== requestIdRef.current) return;
      setItems(state.items);
      setFullPageError(state.fullPageError);
      setPartialError(state.partialError);
    } catch (error) {
      console.warn('schedule fetch failed', error);
      if (requestId !== requestIdRef.current) return;
      setItems([]);
      setFullPageError(SCHEDULE_FULL_PAGE_ERROR);
      setPartialError(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [teamId, range.fromMs, range.toMs, isCoach]);

  // Reload on every return to the tab too, so a game or event added (or
  // deleted) on another screen shows up without a manual refresh.
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestIdRef.current += 1;
      };
    }, [load]),
  );

  return { items, loading, fullPageError, partialError, reload: () => void load() };
}
