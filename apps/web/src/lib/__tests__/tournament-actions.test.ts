import { createTournamentAction } from '../../app/(app)/tournaments/actions';
import { setTournamentModeAction } from '../../app/(app)/admin/users/actions';
import { getTournamentAccess } from '../tournament-access';

const mockProfile = jest.fn();
const mockRpcResult = jest.fn();
const mockRpc = jest.fn(() => ({ single: mockRpcResult }));
const mockGetUser = jest.fn();
const mockClient = {
  auth: { getUser: mockGetUser },
  from: jest.fn(() => {
    const query = {
      select: () => query, eq: () => query, in: () => Promise.resolve({ data: mockTeams, error: null }),
      maybeSingle: mockProfile,
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
  mockProfile.mockResolvedValue({ data: { tournament_mode_enabled: true }, error: null });
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

  it('rejects a grant revoked after page load without submitting a transaction', async () => {
    mockProfile.mockResolvedValue({ data: { tournament_mode_enabled: false }, error: null });
    expect(await createTournamentAction(null, form())).toContain('Tournament mode access is required');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('reports the database denial for a forged or inactive team membership', async () => {
    mockRpcResult.mockResolvedValue({ data: null, error: { code: '42501', message: 'You must be an active head coach or athletic director for the selected team' } });
    expect(await createTournamentAction(null, form())).toBe('You must be an active head coach or athletic director for the selected team.');
  });

  it('reports a grant revoked inside the transaction', async () => {
    mockRpcResult.mockResolvedValue({ data: null, error: { code: '42501', message: 'Tournament mode permission is required' } });
    expect(await createTournamentAction(null, form())).toBe('Tournament mode access is required to create a tournament.');
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

describe('permission and team access', () => {
  it('lists all eligible memberships independently of the active team', async () => {
    mockTeams = ['first', 'second'].map((id) => ({ role: 'head_coach', teams: { id, name: id, organization: null, state_code: null } }));
    const access = await getTournamentAccess(mockClient as never, 'coach');
    expect(access.teams.map((team) => team.id)).toEqual(['first', 'second']);
  });

  it('propagates the database denial of a non-admin permission grant', async () => {
    mockRpc.mockImplementationOnce(() => Promise.resolve({ error: { message: 'Only platform administrators can change tournament mode permission' } }) as never);
    const input = new FormData();
    input.set('userId', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    input.set('enabled', 'true');
    expect(await setTournamentModeAction(null, input)).toContain('Only platform administrators');
  });
});
