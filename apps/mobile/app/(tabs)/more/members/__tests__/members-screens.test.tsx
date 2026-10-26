import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';
import { ApiError } from '../../../../../src/lib/api-client';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockParams = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
  Stack: { Screen: ({ options }: { options?: { headerRight?: () => JSX.Element } }) => options?.headerRight?.() ?? null },
  useLocalSearchParams: () => mockParams(),
  useNavigation: () => ({ addListener: () => () => undefined, dispatch: jest.fn() }),
}));
const mockRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
jest.mock('../../../../../src/features/teams/TeamSwitcher', () => ({ TeamSwitcher: () => null }));
const mockUseMembers = jest.fn();
const mockApi = {
  inviteStaff: jest.fn(),
  inviteParent: jest.fn(),
  invitePlayer: jest.fn(),
  resend: jest.fn(),
  cancel: jest.fn(),
  role: jest.fn(),
  remove: jest.fn(),
  link: jest.fn(),
  unlink: jest.fn(),
};
jest.mock('../../../../../src/features/members/members-api', () => ({
  ...jest.requireActual('../../../../../src/features/members/members-api'),
  useTeamMembers: (...args: unknown[]) => mockUseMembers(...args),
  inviteStaff: (...args: unknown[]) => mockApi.inviteStaff(...args),
  inviteParent: (...args: unknown[]) => mockApi.inviteParent(...args),
  invitePlayer: (...args: unknown[]) => mockApi.invitePlayer(...args),
  resendInvitation: (...args: unknown[]) => mockApi.resend(...args),
  cancelInvitation: (...args: unknown[]) => mockApi.cancel(...args),
  updateMemberRole: (...args: unknown[]) => mockApi.role(...args),
  removeMember: (...args: unknown[]) => mockApi.remove(...args),
  linkParent: (...args: unknown[]) => mockApi.link(...args),
  unlinkParent: (...args: unknown[]) => mockApi.unlink(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const MembersScreen = require('../index').default;
const MemberScreen = require('../[memberId]').default;
const InviteStaffScreen = require('../invite-staff').default;
const InviteParentScreen = require('../invite-parent').default;
const InvitePlayerScreen = require('../invite-player').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const TEAM = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const OTHER_CHILD = '33333333-3333-4333-8333-333333333333';
const members = {
  ownMemberId: 'm-own',
  canManageLeadership: true,
  staff: [
    { memberId: 'm-own', userId: 'me', role: 'head_coach', firstName: 'Cy', lastName: 'Young', email: 'cy@example.com', phone: null },
    { memberId: 'm-scorer', userId: 'scorer', role: 'scorekeeper', firstName: 'Ann', lastName: 'Abel', email: null, phone: null },
  ],
  parents: [
    { memberId: 'm-parent', userId: 'parent', role: 'parent', firstName: 'Pat', lastName: 'Lee', email: 'pat@example.com', phone: null, children: [{ playerId: CHILD, name: 'Sam Lee' }] },
  ],
  players: [
    { playerId: CHILD, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7, email: 'sam@example.com', hasAccount: false, invitePending: true },
    { playerId: OTHER_CHILD, firstName: 'Bo', lastName: 'Diaz', jerseyNumber: null, email: null, hasAccount: true, invitePending: false },
  ],
  invitations: [
    { invitationId: 'inv1', email: 'new@example.com', firstName: 'Nia', lastName: null, role: 'assistant_coach', invitedAt: '2026-10-20T00:00:00Z' },
  ],
};
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const pressAlertButton = (label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((b) => b.text === label)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true, role: 'head_coach' }, loading: false });
  mockUseMembers.mockReturnValue({ data: members });
});

describe('MembersScreen', () => {
  it('should list staff, parents, player accounts and invitations, not opening the coach’s own row', () => {
    renderWithQuery(<MembersScreen />);
    expect(screen.getByText('Staff (2)')).toBeTruthy();
    // Pat's child and the player row.
    expect(screen.getAllByText('Sam Lee')).toHaveLength(2);
    expect(screen.getByText('Invite pending')).toBeTruthy();
    expect(screen.getByText('Has account')).toBeTruthy();

    fireEvent.press(screen.getByText('Ann Abel'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/members/[memberId]', params: { memberId: 'm-scorer' } });
    mockPush.mockClear();
    fireEvent.press(screen.getByText('Cy Young'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should open the invite choices and a player’s invite', () => {
    renderWithQuery(<MembersScreen />);
    fireEvent.press(screen.getByLabelText('Invite someone'));
    fireEvent.press(screen.getByText('Invite a parent'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/more/members/invite-parent');
    fireEvent.press(screen.getByText('sam@example.com'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/members/invite-player', params: { playerId: CHILD } });
  });

  it('should resend or cancel a pending invitation', async () => {
    mockApi.resend.mockResolvedValue({ ok: true });
    mockApi.cancel.mockResolvedValue({ ok: true });
    renderWithQuery(<MembersScreen />);
    fireEvent.press(screen.getByText('Nia'));
    pressAlertButton('Resend invite');
    await waitFor(() => expect(mockApi.resend).toHaveBeenCalledWith(TEAM, 'inv1'));

    fireEvent.press(screen.getByText('Nia'));
    pressAlertButton('Cancel invitation');
    await waitFor(() => expect(mockApi.cancel).toHaveBeenCalledWith(TEAM, 'inv1'));
  });

  it('should tell non-coaches the members are for coaches', () => {
    mockUseMembers.mockReturnValue({ data: undefined, error: new ApiError('forbidden', 'Only coaches') });
    renderWithQuery(<MembersScreen />);
    expect(screen.getByText('Coaches only')).toBeTruthy();
  });
});

describe('MemberScreen', () => {
  it('should change a staff member’s role after confirming, and remove them', async () => {
    mockParams.mockReturnValue({ memberId: 'm-scorer' });
    mockApi.role.mockResolvedValue({ ok: true });
    mockApi.remove.mockResolvedValue({ ok: true });
    renderWithQuery(<MemberScreen />);

    fireEvent.press(screen.getByText('Staff'));
    pressAlertButton('Change role');
    await waitFor(() => expect(mockApi.role).toHaveBeenCalledWith(TEAM, 'm-scorer', 'staff'));

    fireEvent.press(screen.getByText('Remove from team'));
    pressAlertButton('Remove');
    await waitFor(() => expect(mockApi.remove).toHaveBeenCalledWith(TEAM, 'm-scorer'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should link and unlink a parent’s children', async () => {
    mockParams.mockReturnValue({ memberId: 'm-parent' });
    mockApi.link.mockResolvedValue({ ok: true });
    mockApi.unlink.mockResolvedValue({ ok: true });
    renderWithQuery(<MemberScreen />);

    fireEvent.press(screen.getByText('Bo Diaz'));
    await waitFor(() => expect(mockApi.link).toHaveBeenCalledWith(TEAM, 'parent', OTHER_CHILD));
    fireEvent.press(screen.getByText('Sam Lee'));
    await waitFor(() => expect(mockApi.unlink).toHaveBeenCalledWith(TEAM, 'parent', CHILD));
  });

  it('should leave a head coach alone, and offer no leadership roles, for an assistant', () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true, role: 'assistant_coach' }, loading: false });
    mockUseMembers.mockReturnValue({ data: { ...members, ownMemberId: 'm-scorer', canManageLeadership: false } });
    mockParams.mockReturnValue({ memberId: 'm-own' });
    const { unmount } = renderWithQuery(<MemberScreen />);
    expect(screen.getByText(/Only head coaches and athletic directors can change or remove a head coach/)).toBeTruthy();
    expect(screen.queryByText('Remove from team')).toBeNull();
    unmount();

    mockUseMembers.mockReturnValue({ data: { ...members, ownMemberId: 'm-own', canManageLeadership: false } });
    mockParams.mockReturnValue({ memberId: 'm-scorer' });
    renderWithQuery(<MemberScreen />);
    expect(screen.getByText('Remove from team')).toBeTruthy();
    expect(screen.queryByText('Head Coach')).toBeNull();
    expect(screen.queryByText('Athletic Director')).toBeNull();
  });
});

describe('invite screens', () => {
  it('should invite staff with the picked role and go back', async () => {
    mockApi.inviteStaff.mockResolvedValue({ outcome: 'invited' });
    renderWithQuery(<InviteStaffScreen />);

    // With no email yet the button adds them by name.
    fireEvent.press(screen.getByText('Add to the team'));
    expect(screen.getByText('Pick a role.')).toBeTruthy();

    fireEvent.press(screen.getByText('Assistant Coach'));
    fireEvent.changeText(screen.getByLabelText('Email'), 'new@example.com');
    fireEvent.press(screen.getByText('Send invite'));
    await waitFor(() =>
      expect(mockApi.inviteStaff).toHaveBeenCalledWith(TEAM, {
        email: 'new@example.com',
        role: 'assistant_coach',
        firstName: null,
        lastName: null,
        phone: null,
        jerseyNumber: null,
      }),
    );
    expect(alertSpy).toHaveBeenCalledWith('Invite sent', expect.stringContaining('new@example.com'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should not offer an assistant the head coach or AD role', () => {
    mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true, role: 'assistant_coach' }, loading: false });
    renderWithQuery(<InviteStaffScreen />);
    expect(screen.getByText('Assistant Coach')).toBeTruthy();
    expect(screen.queryByText('Head Coach')).toBeNull();
    expect(screen.queryByText('Athletic Director')).toBeNull();
  });

  it('should invite a parent for the chosen children, and show a refusal', async () => {
    mockApi.inviteParent.mockRejectedValue(new ApiError('conflict', 'They are already on this team with another role.'));
    renderWithQuery(<InviteParentScreen />);

    fireEvent.press(screen.getByText('Sam Lee'));
    fireEvent.changeText(screen.getByLabelText('Email'), 'pat@example.com');
    fireEvent.press(screen.getByText('Send invite'));
    await waitFor(() =>
      expect(mockApi.inviteParent).toHaveBeenCalledWith(TEAM, { email: 'pat@example.com', firstName: null, lastName: null, phone: null, playerIds: [CHILD] }),
    );
    expect(await screen.findByText('They are already on this team with another role.')).toBeTruthy();
  });

  it('should invite a player at their roster email, or another', async () => {
    mockParams.mockReturnValue({ playerId: CHILD });
    mockApi.invitePlayer.mockResolvedValue({ outcome: 'invited' });
    renderWithQuery(<InvitePlayerScreen />);

    expect(screen.getByLabelText('Email').props.value).toBe('sam@example.com');
    fireEvent.changeText(screen.getByLabelText('Email'), 'parent@example.com');
    expect(screen.getByText('Not the email on their roster entry.')).toBeTruthy();
    fireEvent.press(screen.getByText('Send invite'));
    await waitFor(() => expect(mockApi.invitePlayer).toHaveBeenCalledWith(TEAM, CHILD, 'parent@example.com'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });
});
