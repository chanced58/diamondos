import { ActivityIndicator, Alert, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { TEAM_ROLE_LABELS, UserRole, isHeadCoachOrAdRole, type TeamParent, type TeamStaffMember } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { ChoiceChips } from '../../../../src/features/practices/ChoiceChips';
import {
  displayName,
  linkParent,
  removeMember,
  teamMembersQueryKey,
  unlinkParent,
  updateMemberRole,
  useTeamMembers,
} from '../../../../src/features/members/members-api';
import { describeApiError } from '../../../../src/lib/api-client';

const ROLE_OPTIONS = Object.values(UserRole);

/**
 * One staff member or parent (the web team admin Users page's row): contact,
 * role, and for a parent the children they're linked to. A coach changes
 * their role, links or unlinks children, or takes them off the team.
 */
export default function MemberScreen() {
  const { memberId = '' } = useLocalSearchParams<{ memberId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const query = useTeamMembers(teamId);
  const queryClient = useQueryClient();

  const refresh = () => void queryClient.invalidateQueries({ queryKey: teamMembersQueryKey(teamId ?? '') });
  const changeRole = useMutation({
    mutationFn: (role: string) => updateMemberRole(teamId as string, memberId, role),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Couldn’t change the role', describeApiError(error)),
  });
  const remove = useMutation({
    mutationFn: () => removeMember(teamId as string, memberId),
    onSuccess: () => {
      refresh();
      router.back();
    },
    onError: (error) => Alert.alert('Couldn’t remove them', describeApiError(error)),
  });
  const link = useMutation({
    mutationFn: ({ parentUserId, playerId, linked }: { parentUserId: string; playerId: string; linked: boolean }) =>
      linked ? unlinkParent(teamId as string, parentUserId, playerId) : linkParent(teamId as string, parentUserId, playerId),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Couldn’t update the children', describeApiError(error)),
  });

  const header = <Stack.Screen options={{ title: 'Member' }} />;
  if (query.isPending && teamId) {
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
        {teamId ? (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState title="No team" message="Join a team to see its members." />
        )}
      </View>
    );
  }

  const parent = query.data.parents.find((p) => p.memberId === memberId);
  const member: TeamStaffMember | TeamParent | undefined = parent ?? query.data.staff.find((m) => m.memberId === memberId);
  if (!member) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Not on the team" message="This member isn’t on the team anymore." />
      </View>
    );
  }

  const name = displayName(member);
  // Head coach and athletic director are for head coaches and ADs to manage (the server says so too).
  const { canManageLeadership } = query.data;
  const locked = !canManageLeadership && isHeadCoachOrAdRole(member.role);
  const roleOptions = canManageLeadership ? ROLE_OPTIONS : ROLE_OPTIONS.filter((role) => !isHeadCoachOrAdRole(role));
  const pickRole = (picked: UserRole[]) => {
    const role = picked.find((r) => r !== member.role);
    if (!role) return;
    Alert.alert(`Make ${name} ${TEAM_ROLE_LABELS[role]}?`, 'Their access changes with their role.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Change role', onPress: () => changeRole.mutate(role) },
    ]);
  };
  const confirmRemove = () =>
    Alert.alert(`Remove ${name} from the team?`, 'They lose access to the team, and their invitations are cancelled.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove.mutate() },
    ]);

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Stack.Screen options={{ title: name }} />
      <Text className="text-2xl font-bold text-gray-900">{name}</Text>
      <Text className="text-sm text-gray-600 mt-1">{TEAM_ROLE_LABELS[member.role as UserRole] ?? member.role}</Text>

      {(member.email || member.phone) && (
        <>
          <SectionHeader title="Contact" />
          <ListGroup>
            {member.email && <ListRow title={member.email} subtitle="Email" onPress={() => void Linking.openURL(`mailto:${member.email}`)} showChevron={false} />}
            {member.phone && <ListRow title={member.phone} subtitle="Phone" onPress={() => void Linking.openURL(`tel:${member.phone}`)} showChevron={false} />}
          </ListGroup>
        </>
      )}

      {parent && (
        <>
          <SectionHeader title="Children" />
          <Text className="text-sm text-gray-600 mb-2">Tap a player to link or unlink them. A parent sees their children’s schedule, RSVPs and notes.</Text>
          <ChildrenPicker
            parent={parent}
            players={query.data.players.map((p) => ({ id: p.playerId, name: `${p.firstName} ${p.lastName}` }))}
            busy={link.isPending}
            onToggle={(playerId, linked) => link.mutate({ parentUserId: parent.userId, playerId, linked })}
          />
        </>
      )}

      {locked ? (
        <Text className="text-sm text-gray-500 mt-6">Only head coaches and athletic directors can change or remove a {TEAM_ROLE_LABELS[member.role as UserRole].toLowerCase()}.</Text>
      ) : (
        <>
          <SectionHeader title="Role" />
          <ChoiceChips options={roleOptions} labels={TEAM_ROLE_LABELS} selected={[member.role as UserRole]} onChange={pickRole} />
          {changeRole.isPending && <Text className="text-sm text-gray-500 mt-2">Changing role…</Text>}

          <View className="mt-6">
            <Button label="Remove from team" variant="danger" loading={remove.isPending} onPress={confirmRemove} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

/** The roster as chips, the parent's children selected; tapping one links or unlinks it. */
function ChildrenPicker({
  parent,
  players,
  busy,
  onToggle,
}: {
  parent: TeamParent;
  players: Array<{ id: string; name: string }>;
  busy: boolean;
  onToggle: (playerId: string, linked: boolean) => void;
}) {
  const linked = new Set(parent.children.map((c) => c.playerId));
  if (players.length === 0) return <Text className="text-sm text-gray-500">No players on the roster.</Text>;
  return (
    <View className="flex-row flex-wrap gap-2">
      {players.map((player) => {
        const isLinked = linked.has(player.id);
        return (
          <TouchableOpacity
            key={player.id}
            accessibilityRole="button"
            accessibilityState={{ selected: isLinked, disabled: busy }}
            disabled={busy}
            onPress={() => onToggle(player.id, isLinked)}
            className={`rounded-full border px-3 py-1.5 ${isLinked ? 'bg-brand-700 border-brand-700' : 'bg-white border-gray-300'}`}
          >
            <Text className={`text-sm ${isLinked ? 'text-white font-semibold' : 'text-gray-700'}`}>{player.name}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
