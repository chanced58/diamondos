import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ListRow, SectionHeader } from '@baseball/ui';
import { useAuth } from '../../../src/providers/AuthProvider';
import { useCan, useRole } from '../../../src/providers/RoleProvider';
import { ListGroup } from '../../../src/features/navigation/ListGroup';
import { openOnWeb, webUrl } from '../../../src/lib/web-links';

const LEAGUE_ROLE_LABELS = { league_admin: 'League admin', league_manager: 'League manager' } as const;

/**
 * Everything that isn't one of the four primary tabs. Rows for features
 * still being brought to the app open the web dashboard instead.
 */
export default function MoreScreen() {
  const { user, signOut } = useAuth();
  const { leagueRoles } = useRole();
  const isCoach = useCan('team.coach');
  const hasWeb = webUrl('/') !== null;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
      <SectionHeader title="Team" />
      <ListGroup>
        <ListRow
          title="Roster"
          subtitle="Players and positions"
          onPress={() => router.push('/(tabs)/more/roster')}
        />
        <ListRow
          title="Practices"
          subtitle="Upcoming practices and attendance"
          onPress={() => router.push('/(tabs)/more/practices')}
        />
        <ListRow
          title="Facilities"
          subtitle="Cage, field and bullpen bookings"
          onPress={() => router.push('/(tabs)/more/facilities')}
        />
        {isCoach && (
          <ListRow
            title="Opponents"
            subtitle="Opponent rosters and scouting cards"
            onPress={() => router.push('/(tabs)/more/opponents')}
          />
        )}
      </ListGroup>

      {leagueRoles.length > 0 && hasWeb && (
        <>
          <SectionHeader title="League" />
          <ListGroup>
            {leagueRoles.map((role) => (
              <ListRow
                key={role.leagueId}
                title={role.leagueName}
                subtitle={`${LEAGUE_ROLE_LABELS[role.role]} · opens on the web`}
                onPress={() => void openOnWeb(role.role === 'league_admin' ? '/league/admin' : '/league')}
              />
            ))}
          </ListGroup>
        </>
      )}

      {hasWeb && (
        <>
          <SectionHeader title="On the web" />
          <ListGroup>
            <ListRow
              title="Open DiamondOS on the web"
              subtitle="Tournaments, team admin and more, while they come to the app"
              onPress={() => void openOnWeb('/dashboard')}
            />
          </ListGroup>
        </>
      )}

      <SectionHeader title="Account" />
      <ListGroup>
        <ListRow title="Signed in as" subtitle={user?.email ?? undefined} />
        <ListRow title="Sign out" onPress={() => void signOut()} showChevron={false} />
      </ListGroup>
    </ScrollView>
  );
}
