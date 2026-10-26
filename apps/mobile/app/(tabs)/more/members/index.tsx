import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { TEAM_ROLE_LABELS, isHeadCoachOrAdRole, type TeamInvitation, type TeamPlayerAccount } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { OptionSheet } from '../../../../src/features/opponents/OptionSheet';
import {
  cancelInvitation,
  displayName,
  resendInvitation,
  teamMembersQueryKey,
  useTeamMembers,
} from '../../../../src/features/members/members-api';
import { describeApiError, isApiError } from '../../../../src/lib/api-client';

const roleLabel = (role: string) => TEAM_ROLE_LABELS[role as keyof typeof TEAM_ROLE_LABELS] ?? role;

/**
 * The team's people (the web team admin Users page): staff, parents and the
 * children they're linked to, players' app accounts and pending invitations.
 * Coaches invite staff and parents from the header, open a member to change
 * their role, link children or remove them, invite players to the app, and
 * resend or cancel invitations.
 */
export default function MembersScreen() {
  const { activeTeam, loading } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const query = useTeamMembers(teamId);
  const queryClient = useQueryClient();
  const [choosing, setChoosing] = useState(false);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: teamMembersQueryKey(teamId ?? '') });
  const resend = useMutation({
    mutationFn: (invitationId: string) => resendInvitation(teamId as string, invitationId),
    onSuccess: () => {
      refresh();
      Alert.alert('Invite sent', 'The invitation email went out again.');
    },
    onError: (error) => Alert.alert('Couldn’t resend the invite', describeApiError(error)),
  });
  const cancel = useMutation({
    mutationFn: (invitationId: string) => cancelInvitation(teamId as string, invitationId),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Couldn’t cancel the invite', describeApiError(error)),
  });

  const go = (pathname: '/(tabs)/more/members/invite-staff' | '/(tabs)/more/members/invite-parent') => () => {
    setChoosing(false);
    router.push(pathname);
  };

  const header = (
    <Stack.Screen
      options={{
        title: 'Team members',
        headerRight: activeTeam?.isCoach
          ? () => (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Invite someone" hitSlop={8} onPress={() => setChoosing(true)}>
                <Text className="text-white text-2xl font-semibold">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );

  if (loading || (teamId && query.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!teamId) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No team" message="Join a team to see its members." />
      </View>
    );
  }
  if (!query.data) {
    const forbidden = isApiError(query.error) && query.error.kind === 'forbidden';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        {forbidden ? (
          <EmptyState title="Coaches only" message="Head coaches, assistants and athletic directors manage team members." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const { staff, parents, players, invitations } = query.data;
  const openMember = (memberId: string) => router.push({ pathname: '/(tabs)/more/members/[memberId]', params: { memberId } });
  const openPlayer = (player: TeamPlayerAccount) =>
    router.push({ pathname: '/(tabs)/more/members/invite-player', params: { playerId: player.playerId } });
  const invitationActions = (invitation: TeamInvitation) => {
    // Head coach and AD invitations are for head coaches and ADs to manage (the server says so too).
    if (!query.data.canManageLeadership && isHeadCoachOrAdRole(invitation.role)) {
      Alert.alert(displayName(invitation), 'Only head coaches and athletic directors can resend or cancel this invitation.');
      return;
    }
    Alert.alert(displayName(invitation), invitation.email ?? 'No email on file', [
      ...(invitation.email ? [{ text: 'Resend invite', onPress: () => resend.mutate(invitation.invitationId) }] : []),
      { text: 'Cancel invitation', style: 'destructive' as const, onPress: () => cancel.mutate(invitation.invitationId) },
      { text: 'Close', style: 'cancel' as const },
    ]);
  };

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <TeamSwitcher />
      <OptionSheet
        title={choosing ? 'Invite' : null}
        options={[
          { key: 'staff', label: 'Invite staff', onPress: go('/(tabs)/more/members/invite-staff') },
          { key: 'parent', label: 'Invite a parent', onPress: go('/(tabs)/more/members/invite-parent') },
        ]}
        onClose={() => setChoosing(false)}
      />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <SectionHeader title={`Staff (${staff.length})`} />
        <ListGroup>
          {staff.map((member) => (
            <ListRow
              key={member.memberId}
              title={displayName(member)}
              subtitle={member.email ?? undefined}
              right={<Badge label={roleLabel(member.role)} />}
              onPress={member.memberId === query.data.ownMemberId ? undefined : () => openMember(member.memberId)}
              showChevron={member.memberId !== query.data.ownMemberId}
            />
          ))}
        </ListGroup>

        <SectionHeader title={`Parents (${parents.length})`} />
        {parents.length === 0 ? (
          <Text className="text-sm text-gray-500">No parents yet. Invite one with +.</Text>
        ) : (
          <ListGroup>
            {parents.map((parent) => (
              <ListRow
                key={parent.memberId}
                title={displayName(parent)}
                subtitle={parent.children.length > 0 ? parent.children.map((c) => c.name).join(', ') : 'No children linked'}
                onPress={() => openMember(parent.memberId)}
              />
            ))}
          </ListGroup>
        )}

        <SectionHeader title="Player accounts" />
        {players.length === 0 ? (
          <Text className="text-sm text-gray-500">No players on the roster.</Text>
        ) : (
          <ListGroup>
            {players.map((player) => (
              <ListRow
                key={player.playerId}
                title={`${player.firstName} ${player.lastName}`}
                subtitle={player.email ?? 'No email on file'}
                right={
                  player.hasAccount ? (
                    <Badge label="Has account" variant="safe" />
                  ) : player.invitePending ? (
                    <Badge label="Invite pending" variant="warning" />
                  ) : undefined
                }
                onPress={player.hasAccount ? undefined : () => openPlayer(player)}
                showChevron={!player.hasAccount}
              />
            ))}
          </ListGroup>
        )}

        {invitations.length > 0 && (
          <>
            <SectionHeader title={`Pending invitations (${invitations.length})`} />
            <ListGroup>
              {invitations.map((invitation) => (
                <ListRow
                  key={invitation.invitationId}
                  title={displayName(invitation)}
                  subtitle={`${roleLabel(invitation.role)} · ${invitation.email ?? 'no email'} · sent ${new Date(invitation.invitedAt).toLocaleDateString()}`}
                  onPress={() => invitationActions(invitation)}
                />
              ))}
            </ListGroup>
          </>
        )}
      </ScrollView>
    </View>
  );
}
