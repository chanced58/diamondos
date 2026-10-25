import { NextResponse } from 'next/server';
import { GET as listRoute, POST as createRoute } from '../../teams/[teamId]/drills/route';
import { DELETE as deleteRoute, GET as detailRoute, PATCH as updateRoute } from '../../drills/[drillId]/route';
import { POST as planRoute } from '../../teams/[teamId]/practices/plan/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  listTeamDrills: jest.fn(),
  loadDrill: jest.fn(),
  createTeamDrill: jest.fn(),
  updateTeamDrill: jest.fn(),
  deleteTeamDrill: jest.fn(),
  planPractice: jest.fn(),
};

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
// A function declaration is hoisted with the mocks; it reads mockServices only when a route calls it.
function forward(name: keyof typeof mockServices) {
  return (...args: unknown[]) => mockServices[name](...args);
}
jest.mock('@/lib/services/practices/drills', () => ({
  listTeamDrills: forward('listTeamDrills'),
  loadDrill: forward('loadDrill'),
  createTeamDrill: forward('createTeamDrill'),
  updateTeamDrill: forward('updateTeamDrill'),
  deleteTeamDrill: forward('deleteTeamDrill'),
}));
jest.mock('@/lib/services/practices/plan-practice', () => ({ planPractice: forward('planPractice') }));

const DB = { name: 'db' };
const team = { params: { teamId: 't1' } };
const drill = { params: { drillId: 'd1' } };
const request = (method: string, body?: unknown, url = 'https://example.com/api/m/v1/x') =>
  new Request(url, {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('drill library routes', () => {
  it('should respond 401 to every route without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      listRoute(request('GET'), team),
      createRoute(request('POST', {}), team),
      detailRoute(request('GET'), drill),
      updateRoute(request('PATCH', {}), drill),
      deleteRoute(request('DELETE'), drill),
      planRoute(request('POST', {}), team),
    ]);
    expect(responses.every((r) => r.status === 401)).toBe(true);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should take the team and drill from the path and answer 201 on creates', async () => {
    expect((await createRoute(request('POST', { teamId: 'spoofed', drill: { name: 'Tee' } }), team)).status).toBe(201);
    expect(mockServices.createTeamDrill).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', drill: { name: 'Tee' } });

    await updateRoute(request('PATCH', { drillId: 'spoofed', drill: { name: 'Tee' } }), drill);
    expect(mockServices.updateTeamDrill).toHaveBeenCalledWith(DB, 'u1', { drillId: 'd1', drill: { name: 'Tee' } });

    await deleteRoute(request('DELETE'), drill);
    expect(mockServices.deleteTeamDrill).toHaveBeenCalledWith(DB, 'u1', { drillId: 'd1' });

    expect((await planRoute(request('POST', { teamId: 'spoofed', drillIds: ['d1'] }), team)).status).toBe(201);
    expect(mockServices.planPractice).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', drillIds: ['d1'] });
  });

  it("should read the viewing team from the drill detail's query", async () => {
    await detailRoute(request('GET', undefined, 'https://example.com/api/m/v1/drills/d1?teamId=t1'), drill);
    expect(mockServices.loadDrill).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', drillId: 'd1' });
  });

  it("should map a service refusal to its status", async () => {
    mockServices.deleteTeamDrill.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Curated drills can’t be changed.' });
    const response = await deleteRoute(request('DELETE'), drill);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Curated drills can’t be changed.', code: 'forbidden' });
  });
});
