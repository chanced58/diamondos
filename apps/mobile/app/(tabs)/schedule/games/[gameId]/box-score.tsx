import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, ErrorState, SegmentedControl } from '@baseball/ui';
import { useBoxScore } from '../../../../../src/features/stats/box-score-api';
import { LineScoreCard } from '../../../../../src/features/stats/LineScoreCard';
import { StatTable } from '../../../../../src/features/stats/StatTable';
import {
  BATTING_COLUMNS,
  FIELDING_COLUMNS,
  PITCHING_COLUMNS,
  battingTotals,
  fieldingTotals,
  pitchingTotals,
} from '../../../../../src/features/stats/box-score-columns';
import { describeApiError, isApiError } from '../../../../../src/lib/api-client';

type Section = 'batting' | 'pitching' | 'fielding';
type Side = 'us' | 'them';

const SECTION_OPTIONS = [
  { value: 'batting', label: 'Batting' },
  { value: 'pitching', label: 'Pitching' },
  { value: 'fielding', label: 'Fielding' },
] as const;

/** A started game's box score (the web's /games/[gameId]/stats). Any team member. */
export default function BoxScoreScreen() {
  const { gameId = '' } = useLocalSearchParams<{ gameId: string }>();
  const query = useBoxScore(gameId);
  const [section, setSection] = useState<Section>('batting');
  const [side, setSide] = useState<Side>('us');

  const header = <Stack.Screen options={{ title: 'Box score' }} />;

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    const notStarted = isApiError(query.error) && query.error.kind === 'conflict';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState
          message={describeApiError(query.error)}
          onRetry={notStarted ? undefined : () => void query.refetch()}
        />
      </View>
    );
  }

  const box = query.data;
  const team = box[side];
  const sideOptions = [
    { value: 'us', label: box.us.name },
    { value: 'them', label: box.them.name },
  ] as const;

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <View className="flex-row items-center justify-between mb-3">
        <Text accessibilityRole="header" className="text-lg font-bold text-gray-900 flex-1" numberOfLines={1}>
          {box.us.name} {box.us.r} – {box.them.r} {box.them.name}
        </Text>
        <Badge label={box.status === 'completed' ? 'Final' : 'Live'} variant={box.status === 'completed' ? 'default' : 'safe'} />
      </View>

      <LineScoreCard box={box} />

      <View className="mt-4 gap-2">
        <SegmentedControl options={SECTION_OPTIONS} value={section} onChange={setSection} testID="box-score-section" />
        <SegmentedControl options={sideOptions} value={side} onChange={setSide} testID="box-score-side" />
      </View>

      <View className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
        {section === 'batting' && (
          <StatTable
            rows={team.batting}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.name}
            columns={BATTING_COLUMNS}
            totals={battingTotals(team.batting)}
            emptyText="No batting data."
          />
        )}
        {section === 'pitching' && (
          <StatTable
            rows={team.pitching}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.name}
            columns={PITCHING_COLUMNS}
            totals={pitchingTotals(team.pitching)}
            emptyText="No pitching data."
            labelHeader="Pitcher"
          />
        )}
        {section === 'fielding' && (
          <StatTable
            rows={team.fielding}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.name}
            columns={FIELDING_COLUMNS}
            totals={fieldingTotals(team.fielding)}
            emptyText="No fielding data."
          />
        )}
      </View>
    </ScrollView>
  );
}
