import { NextResponse } from 'next/server';
import { GET as teamsRoute } from '../[leagueId]/teams/route';
import { DELETE as removeTeamRoute } from '../[leagueId]/teams/[membershipId]/route';
import { POST as divisionRoute } from '../[leagueId]/teams/[membershipId]/division/route';
import { POST as activeRoute } from '../[leagueId]/teams/[membershipId]/active/route';
import { POST as addDivisionRoute } from '../[leagueId]/divisions/route';
import { DELETE as removeDivisionRoute } from '../[leagueId]/divisions/[divisionId]/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  loadLeagueTeams: jest.fn(),
  addLeagueDivision: jest.fn(),
  removeLeagueDivision: jest.fn(),
  setLeagueTeamDivision: jest.fn(),
  setLeagueTeamActive: jest.fn(),
  removeLeagueTeam: jest.fn(),
};
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/league-admin/league-teams', () => ({
  loadLeagueTeams: (...args: unknown[]) => mockServices.loadLeagueTeams(...args),
  addLeagueDivision: (...args: unknown[]) => mockServices.addLeagueDivision(...args),
  removeLeagueDivision: (...args: unknown[]) => mockServices.removeLeagueDivision(...args),
  setLeagueTeamDivision: (...args: unknown[]) => mockServices.setLeagueTeamDivision(...args),
  setLeagueTeamActive: (...args: unknown[]) => mockServices.setLeagueTeamActive(...args),
  removeLeagueTeam: (...args: unknown[]) => mockServices.removeLeagueTeam(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET', body?: unknown) =>
  new Request('https://example.com/api/m/v1/league-admin/l1/teams', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const league = { params: { leagueId: 'l1' } };
const membership = { params: { leagueId: 'l1', membershipId: 'm1' } };
const division = { params: { leagueId: 'l1', divisionId: 'd1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('league admin team and division routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await teamsRoute(request(), league)).status).toBe(401);
    expect((await removeTeamRoute(request('DELETE'), membership)).status).toBe(401);
    expect((await divisionRoute(request('POST', {}), membership)).status).toBe(401);
    expect((await activeRoute(request('POST', {}), membership)).status).toBe(401);
    expect((await addDivisionRoute(request('POST', {}), league)).status).toBe(401);
    expect((await removeDivisionRoute(request('DELETE'), division)).status).toBe(401);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should take the league, team and division from the path', async () => {
    await teamsRoute(request(), league);
    expect(mockServices.loadLeagueTeams).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1' });

    await divisionRoute(request('POST', { divisionId: 'd1', leagueId: 'other' }), membership);
    expect(mockServices.setLeagueTeamDivision).toHaveBeenCalledWith(DB, 'u1', { divisionId: 'd1', leagueId: 'l1', membershipId: 'm1' });

    await activeRoute(request('POST', { isActive: false }), membership);
    expect(mockServices.setLeagueTeamActive).toHaveBeenCalledWith(DB, 'u1', { isActive: false, leagueId: 'l1', membershipId: 'm1' });

    await removeTeamRoute(request('DELETE'), membership);
    expect(mockServices.removeLeagueTeam).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1', membershipId: 'm1' });

    expect((await addDivisionRoute(request('POST', { name: 'North' }), league)).status).toBe(201);
    expect(mockServices.addLeagueDivision).toHaveBeenCalledWith(DB, 'u1', { name: 'North', leagueId: 'l1' });

    await removeDivisionRoute(request('DELETE'), division);
    expect(mockServices.removeLeagueDivision).toHaveBeenCalledWith(DB, 'u1', { leagueId: 'l1', divisionId: 'd1' });
  });

  it('should map refusals to statuses', async () => {
    mockServices.setLeagueTeamActive.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only league admins can change teams.' });
    mockServices.addLeagueDivision.mockResolvedValue({ ok: false, code: 'conflict', error: 'There is already a division named North.' });
    expect((await activeRoute(request('POST', { isActive: true }), membership)).status).toBe(403);
    expect((await addDivisionRoute(request('POST', { name: 'North' }), league)).status).toBe(409);
  });
});
