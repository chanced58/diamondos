import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { LEAGUE_STAFF_ROLE_LABELS, type LeagueStaffMember } from '@baseball/shared';
import { ListGroup } from '../../../../../src/features/navigation/ListGroup';
import { leagueStaffQueryKey, removeLeagueStaff, useLeagueStaff } from '../../../../../src/features/league-admin/league-admin-api';
import { describeApiError, isApiError } from '../../../../../src/lib/api-client';
import { openOnWeb, webUrl } from '../../../../../src/lib/web-links';

/**
 * The league's staff (the League Staff card of the web /league/admin page):
 * league admins see every admin and manager and take them off the staff,
 * never themselves. Inviting staff opens on the web.
 */
export default function LeagueStaffScreen() {
  const { leagueId = '' } = useLocalSearchParams<{ leagueId: string }>();
  const query = useLeagueStaff(leagueId);
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (staffId: string) => removeLeagueStaff(leagueId, staffId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: leagueStaffQueryKey(leagueId) }),
    onError: (error) => Alert.alert('Couldn’t remove them', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'League staff' }} />;
  if (query.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {isApiError(query.error) && query.error.kind === 'forbidden' ? (
          <EmptyState title="League admins only" message="Only league admins see and change the league’s staff." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const confirmRemove = (member: LeagueStaffMember) =>
    Alert.alert(`Remove ${member.name} from the league’s staff?`, 'They lose access to league admin. You can invite them again on the web.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(member.staffId) },
    ]);

  const { staff } = query.data;
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}>
      {header}
      <SectionHeader title={`${query.data.league.name} staff`} />
      {staff.length === 0 ? (
        <Text className="text-sm text-gray-500">No staff members.</Text>
      ) : (
        <ListGroup>
          {staff.map((member) => (
            <ListRow
              key={member.staffId}
              title={member.name}
              subtitle={member.email && member.email !== member.name ? member.email : undefined}
              right={
                <View className="flex-row gap-1">
                  {member.isYou && <Badge label="You" variant="safe" />}
                  <Badge label={LEAGUE_STAFF_ROLE_LABELS[member.role]} />
                </View>
              }
              accessibilityLabel={member.isYou ? `${member.name}, you` : `Remove ${member.name}`}
              disabled={remove.isPending && remove.variables === member.staffId}
              onPress={member.isYou || remove.isPending ? undefined : () => confirmRemove(member)}
            />
          ))}
        </ListGroup>
      )}
      <Text className="text-xs text-gray-500 mt-2">Tap someone to take them off the staff. You can’t remove yourself.</Text>

      {webUrl('/') !== null && (
        <>
          <SectionHeader title="On the web" />
          <ListGroup>
            <ListRow title="Invite staff" subtitle="Inviting admins and managers opens on the web" onPress={() => void openOnWeb('/league/admin')} />
          </ListGroup>
        </>
      )}
    </ScrollView>
  );
}
