import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, ErrorState } from '@baseball/ui';
import { formatInningsPitched, formatSeasonStat, type SeasonPitcher } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { currentTime, useSeasonStats } from '../../../../src/features/stats/season-stats-api';
import { formatPlanDate, restLabel } from '../../../../src/features/stats/season-stats-model';
import { describeApiError } from '../../../../src/lib/api-client';

const BALLS = [0, 1, 2, 3];
const STRIKES = [0, 1, 2];

/**
 * One pitcher's season line (the web pitching table's expanded row): rest
 * status from their latest outing, key rates, and batting average against at
 * each count. Reads the Stats tab's cached season.
 */
export default function PitcherDetailScreen() {
  const { playerId = '', season } = useLocalSearchParams<{ playerId: string; season?: string }>();
  const { activeTeam } = useRole();
  const query = useSeasonStats(activeTeam?.teamId, season);
  const pitcher = query.data?.pitching.find((p) => p.playerId === playerId);

  const header = <Stack.Screen options={{ title: pitcher?.playerName ?? 'Pitcher' }} />;

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!pitcher) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState
          message={query.data ? 'This pitcher has no stats this season.' : describeApiError(query.error)}
          onRetry={query.data ? undefined : () => void query.refetch()}
        />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <RestCard pitcher={pitcher} />

      <View className="mt-3 flex-row flex-wrap rounded-xl border border-gray-200 bg-white p-2">
        <Stat label="IP" value={formatInningsPitched(pitcher.inningsPitchedOuts)} />
        <Stat label="Pitches" value={String(pitcher.totalPitches)} />
        <Stat label="ERA" value={formatSeasonStat(pitcher.era, 'dec')} />
        <Stat label="Strike %" value={formatSeasonStat(pitcher.strikePercentage, 'pct')} />
        <Stat label="First-pitch strike %" value={formatSeasonStat(pitcher.firstPitchStrikePercentage, 'pct')} />
        <Stat label="3-ball count %" value={formatSeasonStat(pitcher.threeBallCountPercentage, 'pct')} />
        <Stat label="Batters faced" value={String(pitcher.totalPAs)} />
        <Stat label="Strikes / balls" value={`${pitcher.strikes} / ${pitcher.balls}`} />
      </View>

      <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mt-5 mb-2 px-1">
        Batting average against by count
      </Text>
      <View className="rounded-xl border border-gray-200 bg-white p-3">
        <View className="flex-row">
          <View style={{ width: 64 }} />
          {STRIKES.map((s) => (
            <Text key={s} className="flex-1 text-center text-xs font-semibold text-gray-500 pb-1">
              {s} {s === 1 ? 'strike' : 'strikes'}
            </Text>
          ))}
        </View>
        {BALLS.map((b) => (
          <View key={b} className="flex-row items-center mb-1">
            <Text style={{ width: 64 }} className="text-xs font-semibold text-gray-500">
              {b} {b === 1 ? 'ball' : 'balls'}
            </Text>
            {STRIKES.map((s) => {
              const cell = pitcher.baByCount[`${b}-${s}`];
              const hasData = Boolean(cell && cell.atBats > 0);
              return (
                <View
                  key={s}
                  accessibilityLabel={hasData ? `${b}-${s}: ${cell.hits} for ${cell.atBats}` : `${b}-${s}: no at-bats`}
                  className={`flex-1 mx-0.5 h-12 items-center justify-center rounded border ${
                    hasData ? 'bg-white border-gray-200' : 'bg-gray-100 border-gray-100'
                  }`}
                >
                  <Text className={`text-sm font-semibold ${hasData ? 'text-gray-900' : 'text-gray-400'}`}>
                    {hasData ? formatSeasonStat(cell.average, 'rate') : '---'}
                  </Text>
                  {hasData && (
                    <Text className="text-[10px] text-gray-400">
                      {cell.hits}/{cell.atBats}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function RestCard({ pitcher }: { pitcher: SeasonPitcher }) {
  const rest = restLabel(pitcher.compliance, currentTime());
  const compliance = pitcher.compliance;
  return (
    <View className="rounded-xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-semibold text-gray-900">Rest</Text>
        <Badge
          label={compliance ? (rest.resting ? `${rest.short} rest` : 'Eligible') : 'No outings'}
          variant={compliance ? (rest.resting ? 'warning' : 'safe') : 'default'}
        />
      </View>
      <Text className="text-sm text-gray-600 mt-1">{rest.long}</Text>
      {compliance && (
        <Text className="text-xs text-gray-500 mt-2">
          Last outing{compliance.lastGameDate ? ` ${formatPlanDate(compliance.lastGameDate)}` : ''}: {compliance.pitchCount} pitches
          {compliance.pitches7d != null ? ` · ${compliance.pitches7d} in the last 7 days` : ''}
        </Text>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-1/2 p-2">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="text-lg font-semibold text-gray-900">{value}</Text>
    </View>
  );
}
