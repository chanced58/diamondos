import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ErrorState } from '@baseball/ui';
import { formatInTimeZone } from '@baseball/shared';
import { useLiveGame } from '../../../../../src/features/live/live-api';
import {
  livePlayerLabel,
  liveScore,
  liveState,
  liveTeams,
  recentPlays,
} from '../../../../../src/features/live/live-model';
import { BaserunnerDisplay } from '../../../../../src/features/scoring/BaserunnerDisplay';
import { describeApiError } from '../../../../../src/lib/api-client';

const RECENT_PLAY_COUNT = 12;

/**
 * Follow a game as it happens (the web's /live/[gameId]) — for parents, fans
 * and anyone on the team who isn't scoring. Read-only; updates arrive over
 * Supabase Realtime.
 */
export default function LiveGameScreen() {
  const { gameId = '' } = useLocalSearchParams<{ gameId: string }>();
  const query = useLiveGame(gameId);
  const data = query.data;
  // The spinner is for a pull; Realtime catch-ups and the backstop refetch run quietly.
  const [pulling, setPulling] = useState(false);
  const pullToRefresh = () => {
    setPulling(true);
    void query.refetch().finally(() => setPulling(false));
  };

  const state = useMemo(() => (data ? liveState(data) : null), [data]);
  const plays = useMemo(() => (data ? recentPlays(data, RECENT_PLAY_COUNT) : []), [data]);
  const header = <Stack.Screen options={{ title: 'Live' }} />;

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!data || !state) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const isLive = data.game.status === 'in_progress';
  const teams = liveTeams(data);
  const score = liveScore(data, state);
  const situation = isLive
    ? `${state.isTopOfInning ? 'Top' : 'Bottom'} of the ${ordinal(state.inning)}`
    : data.game.status === 'completed'
      ? 'Final'
      : 'Not started';
  const jersey = (id: string) => {
    const player = data.players[id];
    return player?.jerseyNumber != null ? String(player.jerseyNumber) : '';
  };

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={pullToRefresh} />}
    >
      {header}

      <View className="bg-brand-900 rounded-2xl p-5">
        <View className="flex-row items-center gap-2">
          {isLive && (
            <View className="flex-row items-center bg-red-600 rounded-full px-2 py-0.5">
              <View className="w-1.5 h-1.5 rounded-full bg-white mr-1" />
              <Text className="text-white text-xs font-bold">LIVE</Text>
            </View>
          )}
          <Text className="text-blue-200 text-sm font-semibold">{situation}</Text>
        </View>
        <Text className="text-blue-200 text-xs mt-1" numberOfLines={1}>
          {data.game.venueName ?? 'Venue TBD'} ·{' '}
          {formatInTimeZone(data.game.scheduledAt, data.game.timeZone, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>

        <View className="mt-4 gap-2">
          <ScoreRow label="Away" name={teams.away} runs={score.away} batting={isLive && state.isTopOfInning} />
          <ScoreRow label="Home" name={teams.home} runs={score.home} batting={isLive && !state.isTopOfInning} />
        </View>
      </View>

      {isLive && (
        <View className="bg-white border border-gray-200 rounded-2xl p-4 mt-4 flex-row gap-4">
          <BaserunnerDisplay gameState={state} runnerShortLabel={jersey} />
          <View className="flex-1 gap-3">
            <Situation label="At bat" value={livePlayerLabel(data.players, state.currentBatterId)} />
            <Situation label="Pitching" value={livePlayerLabel(data.players, state.currentPitcherId)} />
            <Situation
              label="Count"
              value={`${state.balls}-${state.strikes} · ${state.outs} out${state.outs === 1 ? '' : 's'}`}
            />
          </View>
        </View>
      )}

      <Text accessibilityRole="header" className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-6 mb-2 px-1">
        {isLive ? 'Latest plays' : 'Last plays'}
      </Text>
      <View className="bg-white border border-gray-200 rounded-2xl">
        {plays.length === 0 ? (
          <Text className="text-sm text-gray-500 p-4">No plays yet.</Text>
        ) : (
          plays.map((play, index) => (
            <View key={play.id} className={`flex-row px-4 py-3 ${index > 0 ? 'border-t border-gray-100' : ''}`}>
              <Text className="text-xs text-gray-400 w-12">
                {play.isTopOfInning ? 'T' : 'B'}
                {play.inning}
              </Text>
              <Text className={`flex-1 text-sm ${index === 0 ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                {play.text}
              </Text>
            </View>
          ))
        )}
      </View>
      {isLive && !query.realtimeConnected && (
        <Text className="text-xs text-gray-400 mt-2 px-1">Connecting for live updates…</Text>
      )}
    </ScrollView>
  );
}

function ScoreRow({ label, name, runs, batting }: { label: string; name: string; runs: number; batting: boolean }) {
  return (
    <View className="flex-row items-center">
      <Text className="text-blue-300 text-xs w-12">{label}</Text>
      <Text className="flex-1 text-white text-base font-semibold" numberOfLines={1}>
        {name}
        {batting ? '  ◂' : ''}
      </Text>
      <Text className="text-white text-3xl font-bold">{runs}</Text>
    </View>
  );
}

function Situation({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</Text>
      <Text className="text-base text-gray-900" numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}
