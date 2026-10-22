import { ScrollView, Text, View } from 'react-native';
import type { GameBoxScoreResponse, GameBoxScoreSide } from '@baseball/shared';
import { homeSkippedLastHalf } from './box-score-columns';

const MIN_INNINGS = 7;
const TEAM_WIDTH = 104;
const CELL = 28;

/**
 * The inning-by-inning line, batting order top to bottom: the away team on
 * the first row, home on the second, as a scoreboard reads.
 */
export function LineScoreCard({ box }: { box: GameBoxScoreResponse }) {
  const [away, home] = box.weAreHome ? [box.them, box.us] : [box.us, box.them];
  const innings = Math.max(MIN_INNINGS, away.runsByInning.length, home.runsByInning.length);
  const inningNumbers = Array.from({ length: innings }, (_, i) => i + 1);
  const skippedHomeHalf = homeSkippedLastHalf(box.status, away, home);

  const row = (side: GameBoxScoreSide, isHome: boolean) => (
    <View className="flex-row items-center h-8">
      {inningNumbers.map((n) => {
        const runs = side.runsByInning[n - 1];
        return (
          <Text key={n} style={{ width: CELL }} className="text-center text-sm text-gray-800">
            {runs ?? (isHome && n === skippedHomeHalf ? 'x' : '')}
          </Text>
        );
      })}
      {(['r', 'h', 'e'] as const).map((stat) => (
        <Text key={stat} style={{ width: CELL + 4 }} className="text-center text-sm font-bold text-gray-900">
          {side[stat]}
        </Text>
      ))}
    </View>
  );

  return (
    <View className="bg-white rounded-xl border border-gray-200 py-2 flex-row">
      <View style={{ width: TEAM_WIDTH }} className="px-3">
        <View className="h-6" />
        <Text className="h-8 leading-8 text-sm font-semibold text-gray-900" numberOfLines={1}>{away.name}</Text>
        <Text className="h-8 leading-8 text-sm font-semibold text-gray-900" numberOfLines={1}>{home.name}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View className="flex-row h-6 items-center">
            {inningNumbers.map((n) => (
              <Text key={n} style={{ width: CELL }} className="text-center text-xs font-semibold text-gray-500">{n}</Text>
            ))}
            {['R', 'H', 'E'].map((label) => (
              <Text key={label} style={{ width: CELL + 4 }} className="text-center text-xs font-semibold text-gray-700">{label}</Text>
            ))}
          </View>
          {row(away, false)}
          {row(home, true)}
        </View>
      </ScrollView>
    </View>
  );
}
