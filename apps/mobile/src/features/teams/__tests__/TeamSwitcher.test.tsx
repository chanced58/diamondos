import { fireEvent, render, screen } from '@testing-library/react-native';
import { TeamSwitcher } from '../TeamSwitcher';

jest.mock('../../../providers/RoleProvider', () => ({ useRole: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useRole } = require('../../../providers/RoleProvider');
const mockUseRole = useRole as jest.Mock;

const huskies = { teamId: 'regular', teamName: 'Huskies', role: 'head_coach', isCoach: true, isTournamentTeam: false };
const natives = { teamId: 'cup-team', teamName: 'Idaho Natives', role: 'head_coach', isCoach: true, isTournamentTeam: true };

describe('TeamSwitcher', () => {
  it('renders nothing for a single team', () => {
    mockUseRole.mockReturnValue({ memberships: [huskies], activeTeam: huskies, setActiveTeamId: jest.fn() });
    render(<TeamSwitcher />);
    expect(screen.queryByText('Huskies')).toBeNull();
  });

  it('lists every team and tags the tournament team', () => {
    mockUseRole.mockReturnValue({ memberships: [huskies, natives], activeTeam: huskies, setActiveTeamId: jest.fn() });
    render(<TeamSwitcher />);
    expect(screen.getByText('Huskies')).toBeTruthy();
    expect(screen.getByText('Idaho Natives')).toBeTruthy();
    expect(screen.getAllByText('Tournament')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Huskies' }).props.accessibilityState).toMatchObject({ selected: true });
  });

  it('switches the active team so that team’s games show', () => {
    const setActiveTeamId = jest.fn().mockResolvedValue(undefined);
    mockUseRole.mockReturnValue({ memberships: [huskies, natives], activeTeam: huskies, setActiveTeamId });
    render(<TeamSwitcher />);
    fireEvent.press(screen.getByRole('button', { name: 'Idaho Natives, tournament team' }));
    expect(setActiveTeamId).toHaveBeenCalledWith('cup-team');
  });
});
