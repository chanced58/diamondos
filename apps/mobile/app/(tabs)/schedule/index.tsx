import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SegmentedControl } from '@baseball/ui';
import { GamesScreen } from '../../../src/features/games/GamesList';
import { ScheduleList } from '../../../src/features/schedule/ScheduleList';
import { TeamSwitcher } from '../../../src/features/teams/TeamSwitcher';

type ScheduleView = 'games' | 'all';

const VIEW_OPTIONS = [
  { value: 'games', label: 'Games' },
  { value: 'all', label: 'Full schedule' },
] as const;

/**
 * The Schedule tab: the active team's games (scoring, lineups, RSVPs — what
 * the Games tab used to be, and still the default) and the full calendar of
 * games, practices and team events. `?view=all` opens the calendar.
 */
export default function ScheduleTabScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  // The route param is the only source of truth: the tab stays mounted, so a
  // later link (Home's cards) and a tap on the control both land here.
  const view: ScheduleView = params.view === 'all' ? 'all' : 'games';
  const setView = (next: ScheduleView) => router.setParams({ view: next });

  return (
    <View className="flex-1 bg-gray-50">
      <TeamSwitcher />
      <View className="bg-white px-3 py-2 border-b border-gray-200">
        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} testID="schedule-view" />
      </View>
      <View className="flex-1">{view === 'games' ? <GamesScreen /> : <ScheduleList />}</View>
    </View>
  );
}
