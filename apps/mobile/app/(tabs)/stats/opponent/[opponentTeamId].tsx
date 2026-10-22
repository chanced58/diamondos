import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Badge, ErrorState, SegmentedControl } from '@baseball/ui';
import { useRole } from '../../../../src/providers/RoleProvider';
import { useSeasonStats } from '../../../../src/features/stats/season-stats-api';
import { StatTable } from '../../../../src/features/stats/StatTable';
import {
  OPPONENT_BATTING_COLUMNS,
  OPPONENT_PITCHING_COLUMNS,
  formatRecord,
  opponentBattingTotals,
  opponentPitchingTotals,
} from '../../../../src/features/stats/season-stats-model';
import { describeApiError } from '../../../../src/lib/api-client';

const SECTION_OPTIONS = [
  { value: 'batting', label: 'Batting' },
  { value: 'pitching', label: 'Pitching' },
] as const;

/**
 * One opponent's season against us (the web Opponents tab's card): our record
 * and their batting and pitching. Reads the Stats tab's cached season.
 */
export default function OpponentStatsScreen() {
  const { opponentTeamId = '', season } = useLocalSearchParams<{ opponentTeamId: string; season?: string }>();
  const { activeTeam } = useRole();
  const query = useSeasonStats(activeTeam?.teamId, season);
  const [section, setSection] = useState<'batting' | 'pitching'>('batting');
  const team = query.data?.opponents?.find((t) => t.teamId === opponentTeamId);

  const header = <Stack.Screen options={{ title: team?.teamName ?? 'Opponent' }} />;

  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!team) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState
          message={query.data ? 'No stats against this opponent this season.' : describeApiError(query.error)}
          onRetry={query.data ? undefined : () => void query.refetch()}
        />
      </View>
    );
  }

  const batting = [...team.batting].sort((a, b) => b.pa - a.pa);
  const pitching = [...team.pitching].sort((a, b) => b.inningsPitchedOuts - a.inningsPitchedOuts);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm text-gray-600">
          {team.gamesPlayed} {team.gamesPlayed === 1 ? 'game' : 'games'} · our record
        </Text>
        <Badge label={formatRecord(team)} />
      </View>
      <SegmentedControl options={SECTION_OPTIONS} value={section} onChange={setSection} testID="opponent-section" />
      <View className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
        {section === 'batting' ? (
          <StatTable
            rows={batting}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.playerName}
            columns={OPPONENT_BATTING_COLUMNS}
            totals={opponentBattingTotals(batting)}
            emptyText="No batting data."
            labelHeader="Batter"
          />
        ) : (
          <StatTable
            rows={pitching}
            rowKey={(r) => r.playerId}
            rowLabel={(r) => r.playerName}
            columns={OPPONENT_PITCHING_COLUMNS}
            totals={opponentPitchingTotals(pitching)}
            emptyText="No pitching data."
            labelHeader="Pitcher"
          />
        )}
      </View>
    </ScrollView>
  );
}
