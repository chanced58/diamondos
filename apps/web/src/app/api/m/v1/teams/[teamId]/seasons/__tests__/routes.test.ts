import { NextResponse } from 'next/server';
import { GET as seasonsRoute, POST as createRoute } from '../route';
import { POST as activateRoute } from '../[seasonId]/activate/route';
import { POST as deactivateRoute } from '../[seasonId]/deactivate/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  loadTeamSeasons: jest.fn(),
  createTeamSeason: jest.fn(),
  setActiveTeamSeason: jest.fn(),
  deactivateTeamSeason: jest.fn(),
};
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/seasons/team-seasons', () => ({
  loadTeamSeasons: (...args: unknown[]) => mockServices.loadTeamSeasons(...args),
  createTeamSeason: (...args: unknown[]) => mockServices.createTeamSeason(...args),
  setActiveTeamSeason: (...args: unknown[]) => mockServices.setActiveTeamSeason(...args),
  deactivateTeamSeason: (...args: unknown[]) => mockServices.deactivateTeamSeason(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET', body?: unknown) =>
  new Request('https://example.com/api/m/v1/teams/t1/seasons', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const team = { params: { teamId: 't1' } };
const season = { params: { teamId: 't1', seasonId: 's1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('season routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      seasonsRoute(request(), team),
      createRoute(request('POST', {}), team),
      activateRoute(request('POST'), season),
      deactivateRoute(request('POST'), season),
    ]);
    for (const response of responses) expect(response.status).toBe(401);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should take ids from the path over the body', async () => {
    await seasonsRoute(request(), team);
    expect(mockServices.loadTeamSeasons).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1' });

    await activateRoute(request('POST'), season);
    expect(mockServices.setActiveTeamSeason).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', seasonId: 's1' });
    await deactivateRoute(request('POST'), season);
    expect(mockServices.deactivateTeamSeason).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', seasonId: 's1' });
  });

  it('should answer a created season with 201, and map a refusal', async () => {
    expect((await createRoute(request('POST', { term: 'Fall', year: 2027, teamId: 'other' }), team)).status).toBe(201);
    expect(mockServices.createTeamSeason).toHaveBeenCalledWith(DB, 'u1', { term: 'Fall', year: 2027, teamId: 't1' });

    mockServices.createTeamSeason.mockResolvedValue({ ok: false, code: 'conflict', error: 'Fall 2027 already exists.' });
    const response = await createRoute(request('POST', { term: 'Fall', year: 2027 }), team);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'Fall 2027 already exists.', code: 'conflict' });
  });
});
