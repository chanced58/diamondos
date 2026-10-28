import { ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { EmptyState, ListRow, SectionHeader } from '@baseball/ui';
import { useRole } from '../../../../../src/providers/RoleProvider';
import { ListGroup } from '../../../../../src/features/navigation/ListGroup';
import { openOnWeb, webUrl } from '../../../../../src/lib/web-links';

const ROLE_LABELS = { league_admin: 'League admin', league_manager: 'League manager' } as const;

/**
 * A league its staff run (the web /league/admin page): the league's players,
 * with the rest of league admin on the web for now. Admins change things;
 * managers read.
 */
export default function LeagueAdminScreen() {
  const { leagueId = '' } = useLocalSearchParams<{ leagueId: string }>();
  const { leagueRoles } = useRole();
  const role = leagueRoles.find((r) => r.leagueId === leagueId);

  const header = <Stack.Screen options={{ title: role?.leagueName ?? 'League admin' }} />;
  if (!role) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="League staff only" message="You aren’t on this league’s staff." />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}>
      {header}
      <Text className="text-sm text-gray-500 mt-4">
        {ROLE_LABELS[role.role]}
        {role.role === 'league_manager' ? ' · you can view; league admins make changes' : ''}
      </Text>

      <SectionHeader title="Manage" />
      <ListGroup>
        <ListRow
          title="Players"
          subtitle="Register, assign, trade and release players"
          onPress={() => router.push({ pathname: '/(tabs)/more/league-admin/[leagueId]/players', params: { leagueId } })}
        />
        <ListRow
          title="Teams and divisions"
          subtitle="Divisions, and each team's division and status"
          onPress={() => router.push({ pathname: '/(tabs)/more/league-admin/[leagueId]/teams', params: { leagueId } })}
        />
        <ListRow
          title="Scoring settings"
          subtitle="Lineups, game length, guests, dual scorekeeping and pitch counts"
          onPress={() => router.push({ pathname: '/(tabs)/more/league-admin/[leagueId]/scoring', params: { leagueId } })}
        />
      </ListGroup>

      {webUrl('/') !== null && (
        <>
          <SectionHeader title="On the web" />
          <ListGroup>
            <ListRow
              title="League details, staff and adding teams"
              subtitle="The rest of league admin opens on the web"
              onPress={() => void openOnWeb('/league/admin')}
            />
          </ListGroup>
        </>
      )}
    </ScrollView>
  );
}
