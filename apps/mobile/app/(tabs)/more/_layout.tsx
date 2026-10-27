import { Stack } from 'expo-router';
import { BRAND_STACK_OPTIONS } from '../../../src/navigation/stack-options';

export const unstable_settings = { initialRouteName: 'index' };

/** The More tab's stack: Roster, Practices, Facilities and Opponents push within the tab. */
export default function MoreLayout() {
  return (
    <Stack screenOptions={BRAND_STACK_OPTIONS}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="roster/index" options={{ title: 'Roster' }} />
      <Stack.Screen name="roster/new" options={{ title: 'Add player' }} />
      <Stack.Screen name="roster/[playerId]/index" options={{ title: 'Player' }} />
      <Stack.Screen name="roster/[playerId]/edit" options={{ title: 'Edit player' }} />
      <Stack.Screen name="roster/[playerId]/availability" options={{ title: 'Availability' }} />
      <Stack.Screen name="roster/[playerId]/documents/index" options={{ title: 'Documents' }} />
      <Stack.Screen name="roster/[playerId]/documents/new" options={{ title: 'Upload document' }} />
      <Stack.Screen name="members/index" options={{ title: 'Team members' }} />
      <Stack.Screen name="members/[memberId]" options={{ title: 'Member' }} />
      <Stack.Screen name="members/invite-staff" options={{ title: 'Invite staff' }} />
      <Stack.Screen name="members/invite-parent" options={{ title: 'Invite a parent' }} />
      <Stack.Screen name="members/invite-player" options={{ title: 'Invite to the app' }} />
      <Stack.Screen name="seasons/index" options={{ title: 'Seasons' }} />
      <Stack.Screen name="practices/index" options={{ title: 'Practices' }} />
      <Stack.Screen name="practices/new" options={{ title: 'New practice' }} />
      <Stack.Screen name="practices/[practiceId]/index" options={{ title: 'Practice' }} />
      <Stack.Screen name="practices/[practiceId]/notes" options={{ title: 'Practice notes' }} />
      <Stack.Screen name="practices/[practiceId]/run" options={{ title: 'Run practice' }} />
      <Stack.Screen name="practices/[practiceId]/template" options={{ title: 'Apply a template' }} />
      <Stack.Screen name="practices/ai" options={{ title: 'Generate with AI' }} />
      <Stack.Screen name="practices/prep" options={{ title: 'Prep for next game' }} />
      <Stack.Screen name="practices/templates" options={{ title: 'Templates' }} />
      <Stack.Screen name="practices/plan" options={{ title: 'Plan from drills' }} />
      <Stack.Screen name="practices/drills/index" options={{ title: 'Drill library' }} />
      <Stack.Screen name="practices/drills/new" options={{ title: 'New drill' }} />
      <Stack.Screen name="practices/drills/[drillId]/index" options={{ title: 'Drill' }} />
      <Stack.Screen name="practices/drills/[drillId]/edit" options={{ title: 'Edit drill' }} />
      <Stack.Screen name="league/index" options={{ title: 'League' }} />
      <Stack.Screen name="league/home" options={{ title: 'League home' }} />
      <Stack.Screen name="league/team/[teamId]" options={{ title: 'Team' }} />
      <Stack.Screen name="league-admin/[leagueId]/index" options={{ title: 'League admin' }} />
      <Stack.Screen name="league-admin/[leagueId]/players/index" options={{ title: 'League players' }} />
      <Stack.Screen name="league-admin/[leagueId]/players/new" options={{ title: 'Add player' }} />
      <Stack.Screen name="league-admin/[leagueId]/players/[playerId]/index" options={{ title: 'Player' }} />
      <Stack.Screen name="league-admin/[leagueId]/players/[playerId]/move" options={{ title: 'Trade player' }} />
      <Stack.Screen name="league-admin/[leagueId]/players/[playerId]/release" options={{ title: 'Release player' }} />
      <Stack.Screen name="league-admin/[leagueId]/teams/index" options={{ title: 'Teams and divisions' }} />
      <Stack.Screen name="league-admin/[leagueId]/teams/[membershipId]" options={{ title: 'Team' }} />
      <Stack.Screen name="tournaments/index" options={{ title: 'Tournaments' }} />
      <Stack.Screen name="tournaments/new" options={{ title: 'New tournament' }} />
      <Stack.Screen name="tournaments/[tournamentId]" options={{ title: 'Tournament' }} />
      <Stack.Screen name="training/index" options={{ title: 'Training' }} />
      <Stack.Screen name="training/[slug]" options={{ title: 'Training' }} />
      <Stack.Screen name="facilities/index" options={{ title: 'Facilities' }} />
      <Stack.Screen name="facilities/new-booking" options={{ title: 'Book a facility' }} />
      <Stack.Screen name="facilities/manage" options={{ title: 'Manage facilities' }} />
      <Stack.Screen name="opponents/index" options={{ title: 'Opponents' }} />
      <Stack.Screen name="opponents/new" options={{ title: 'New opponent' }} />
      <Stack.Screen name="opponents/[opponentTeamId]/index" options={{ title: 'Opponent' }} />
      <Stack.Screen name="opponents/[opponentTeamId]/edit" options={{ title: 'Edit opponent' }} />
      <Stack.Screen name="opponents/[opponentTeamId]/card" options={{ title: 'Scouting card' }} />
    </Stack>
  );
}
