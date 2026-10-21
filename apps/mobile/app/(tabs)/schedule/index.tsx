import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { SegmentedControl } from '@baseball/ui';
import { GamesScreen } from '../../../src/features/games/GamesList';
import { ScheduleCalendar } from '../../../src/features/schedule/ScheduleCalendar';
import { TeamSwitcher } from '../../../src/features/teams/TeamSwitcher';
import { useRole } from '../../../src/providers/RoleProvider';

type ScheduleView = 'games' | 'all';

const VIEW_OPTIONS = [
  { value: 'games', label: 'Games' },
  { value: 'all', label: 'Calendar' },
] as const;

/**
 * The Schedule tab: the active team's games (scoring, lineups, RSVPs — still
 * the default) and the month calendar of games, practices and team events.
 * `?view=all` opens the calendar. Coaches add games and events from the
 * header's "+".
 */
export default function ScheduleTabScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const { activeTeam } = useRole();
  // The route param is the only source of truth: the tab stays mounted, so a
  // later link (Home's cards) and a tap on the control both land here.
  const view: ScheduleView = params.view === 'all' ? 'all' : 'games';
  const setView = (next: ScheduleView) => router.setParams({ view: next });

  const chooseWhatToAdd = () =>
    Alert.alert(`Add to ${activeTeam?.teamName ?? 'the schedule'}`, undefined, [
      { text: 'Game', onPress: () => router.push('/(tabs)/schedule/games/new') },
      { text: 'Team event', onPress: () => router.push('/(tabs)/schedule/events/new') },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View className="flex-1 bg-gray-50">
      <Stack.Screen
        options={{
          headerRight: activeTeam?.isCoach
            ? () => (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add to schedule" hitSlop={8} onPress={chooseWhatToAdd}>
                  <Text className="text-white text-2xl font-semibold px-1">+</Text>
                </TouchableOpacity>
              )
            : undefined,
        }}
      />
      <TeamSwitcher />
      <View className="bg-white px-3 py-2 border-b border-gray-200">
        <SegmentedControl options={VIEW_OPTIONS} value={view} onChange={setView} testID="schedule-view" />
      </View>
      <View className="flex-1">{view === 'games' ? <GamesScreen /> : <ScheduleCalendar />}</View>
    </View>
  );
}
