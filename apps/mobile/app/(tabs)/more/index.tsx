import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { ListRow, SectionHeader } from '@baseball/ui';
import { Feature, TRAINING_ROLES } from '@baseball/shared';
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
  const { leagueRoles, memberships } = useRole();
  const isCoach = useCan('team.coach');
  // As on the web, training is for anyone with a coaching role on any team.
  const offersTraining = memberships.some((m) => TRAINING_ROLES.includes(m.role));
  // As on the web, the league page is on plans with league management.
  const hasLeague = useCan(Feature.LEAGUE_MANAGEMENT);
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
        {hasLeague && (
          <ListRow
            title="League"
            subtitle="Standings, divisions and staff"
            onPress={() => router.push('/(tabs)/more/league')}
          />
        )}
        <ListRow
          title="Tournaments"
          subtitle="Tournament teams, games and stats"
          onPress={() => router.push('/(tabs)/more/tournaments')}
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
        {isCoach && (
          <ListRow
            title="Team members"
            subtitle="Staff, parents, player accounts and invites"
            onPress={() => router.push('/(tabs)/more/members')}
          />
        )}
        {isCoach && (
          <ListRow
            title="Seasons"
            subtitle="Create seasons and set the active one"
            onPress={() => router.push('/(tabs)/more/seasons')}
          />
        )}
        {offersTraining && (
          <ListRow
            title="Training"
            subtitle="Learn DiamondOS and get Certified"
            onPress={() => router.push('/(tabs)/more/training')}
          />
        )}
      </ListGroup>

      {leagueRoles.length > 0 && (
        <>
          <SectionHeader title="League admin" />
          <ListGroup>
            {leagueRoles.map((role) => (
              <ListRow
                key={role.leagueId}
                title={role.leagueName}
                subtitle={LEAGUE_ROLE_LABELS[role.role]}
                onPress={() => router.push({ pathname: '/(tabs)/more/league-admin/[leagueId]', params: { leagueId: role.leagueId } })}
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
              subtitle="Player profiles, team branding, league setup, staff invites and practice block editing"
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
