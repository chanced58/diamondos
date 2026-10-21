import { View } from 'react-native';
import { router } from 'expo-router';
import { EmptyState, ListRow, SectionHeader } from '@baseball/ui';
import { TeamSwitcher } from '../../../src/features/teams/TeamSwitcher';
import { ListGroup } from '../../../src/features/navigation/ListGroup';
import { openOnWeb, webUrl } from '../../../src/lib/web-links';

/**
 * Placeholder until season stats come to the app (Phase 3): points at the
 * roster here and the stats pages on the web.
 */
export default function StatsScreen() {
  const hasWeb = webUrl('/') !== null;

  return (
    <View className="flex-1 bg-gray-50">
      <TeamSwitcher />
      <View className="px-4">
        <SectionHeader title="Team" />
        <ListGroup>
          <ListRow
            title="Roster"
            subtitle="Players and positions"
            onPress={() => router.push('/(tabs)/more/roster')}
          />
        </ListGroup>
      </View>
      <EmptyState
        title="Season stats are coming to the app"
        message="Batting, pitching and pitch-count compliance are on the web for now."
        action={hasWeb ? { label: 'Open stats on the web', onPress: () => void openOnWeb('/compliance') } : undefined}
      />
    </View>
  );
}
