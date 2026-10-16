import { createTournamentAction } from '../../app/(app)/tournaments/actions';
import { getTournamentTeamOptions } from '@baseball/database';

const mockRpcResult = jest.fn();
const mockRpc = jest.fn(() => ({ single: mockRpcResult }));
const mockGetUser = jest.fn();
const mockClient = {
  auth: { getUser: mockGetUser },
  from: jest.fn(() => {
    const query = {
      select: () => query, eq: () => query, in: () => Promise.resolve({ data: mockTeams, error: null }),
    };
    return query;
  }),
  rpc: mockRpc,
};
let mockTeams: unknown[] = [];

jest.mock('@/lib/supabase/server', () => ({ createServerClient: () => mockClient }));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error(url), { digest: 'NEXT_REDIRECT' }); },
}));

function form(teamType = 'existing') {
  const value = new FormData();
  for (const [key, entry] of Object.entries({
    name: 'Fall Classic', startDate: '2026-10-20', endDate: '2026-10-22',
    requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', teamType,
    teamId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', teamName: 'Stars',
  })) value.set(key, entry);
  return value;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'coach' } } });
  mockRpc.mockImplementation(() => ({ single: mockRpcResult }));
  mockRpcResult.mockResolvedValue({ data: { tournament_id: 'cup', team_id: 'team', season_id: 'season' }, error: null });
  mockTeams = [];
});

describe('createTournamentAction', () => {
  it.each(['existing', 'new'])('creates the %s team branch through the authenticated RPC', async (teamType) => {
    await expect(createTournamentAction(null, form(teamType))).rejects.toThrow('/tournaments/cup');
    expect(mockRpc).toHaveBeenCalledWith('create_tournament', expect.objectContaining({
      p_input: expect.objectContaining({ requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', team: expect.objectContaining({ type: teamType }) }),
    }));
  });

  it('lets any signed-in coach create a tournament without a per-user grant', async () => {
    await expect(createTournamentAction(null, form('new'))).rejects.toThrow('/tournaments/cup');
    expect(mockClient.from).not.toHaveBeenCalledWith('user_profiles');
  });

  it('asks a signed-out user to sign in without submitting a transaction', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await createTournamentAction(null, form())).toContain('sign in');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reports the database denial for a forged or inactive team membership', async () => {
    mockRpcResult.mockResolvedValue({ data: null, error: { code: '42501', message: 'You must be an active head coach or athletic director for the selected team' } });
    expect(await createTournamentAction(null, form())).toBe('You must be an active head coach or athletic director for the selected team.');
  });

  it('returns field validation errors before issuing an RPC', async () => {
    const input = form();
    input.set('endDate', '2026-10-19');
    expect(await createTournamentAction(null, input)).toContain('End date');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('preserves entries and the request ID after a recoverable RPC failure', async () => {
    const input = form('new');
    const entries = Array.from(input.entries());
    mockRpcResult.mockResolvedValue({ data: null, error: { message: 'internal database detail' } });
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await createTournamentAction(null, input)).toBe('Tournament creation failed. Your entries are still here; please try again.');
      expect(Array.from(input.entries())).toEqual(entries);
    } finally { log.mockRestore(); }
  });
});

describe('team access', () => {
  it('lists all eligible memberships independently of the active team', async () => {
    mockTeams = ['first', 'second'].map((id) => ({ role: 'head_coach', teams: { id, name: id, organization: null, state_code: null } }));
    const teams = await getTournamentTeamOptions(mockClient as never, 'coach');
    expect(teams.map((team) => team.id)).toEqual(['first', 'second']);
  });
});
