import { NextResponse } from 'next/server';
import { GET as getLeagueChannels } from '../../teams/[teamId]/league-channels/route';
import { GET as getLeagueChannel } from '../[leagueChannelId]/route';

const mockRequireApiUser = jest.fn();
const mockList = jest.fn();
const mockLoad = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/messaging/league-messaging', () => ({
  listLeagueChannels: (...args: unknown[]) => mockList(...args),
  loadLeagueChannel: (...args: unknown[]) => mockLoad(...args),
}));

const DB = { name: 'db' };
const request = () => new Request('https://example.com/api/m/v1/x', { headers: { authorization: 'Bearer token' } });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
});

describe('league channel routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      getLeagueChannels(request(), { params: { teamId: 't1' } }),
      getLeagueChannel(request(), { params: { leagueChannelId: 'c1' } }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401]);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockLoad).not.toHaveBeenCalled();
  });

  it('should pass the caller and path to the services', async () => {
    mockList.mockResolvedValue({ ok: true, data: { teamId: 't1', leagueName: null, channels: [] } });
    mockLoad.mockResolvedValue({ ok: false, code: 'not_found', error: 'Channel not found.' });

    const list = await getLeagueChannels(request(), { params: { teamId: 't1' } });
    expect(list.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1' });

    const detail = await getLeagueChannel(request(), { params: { leagueChannelId: 'c1' } });
    expect(detail.status).toBe(404);
    expect(mockLoad).toHaveBeenCalledWith(DB, 'u1', { leagueChannelId: 'c1' });
  });
});
