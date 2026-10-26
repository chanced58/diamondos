import { NextResponse } from 'next/server';
import { POST as createRoute } from '../route';
import { GET as playerRoute, PATCH as updateRoute } from '../[playerId]/route';
import { POST as deactivateRoute } from '../[playerId]/deactivate/route';
import { POST as reactivateRoute } from '../[playerId]/reactivate/route';
import { GET as flagsRoute, POST as addFlagRoute } from '../[playerId]/injury-flags/route';
import { POST as endFlagRoute } from '../[playerId]/injury-flags/[flagId]/end/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  createRosterPlayer: jest.fn(),
  loadRosterPlayer: jest.fn(),
  updateRosterPlayer: jest.fn(),
  deactivateRosterPlayer: jest.fn(),
  reactivateRosterPlayer: jest.fn(),
  loadPlayerAvailability: jest.fn(),
  addInjuryFlag: jest.fn(),
  endInjuryFlag: jest.fn(),
};
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/roster/roster-players', () => ({
  createRosterPlayer: (...args: unknown[]) => mockServices.createRosterPlayer(...args),
  loadRosterPlayer: (...args: unknown[]) => mockServices.loadRosterPlayer(...args),
  updateRosterPlayer: (...args: unknown[]) => mockServices.updateRosterPlayer(...args),
  deactivateRosterPlayer: (...args: unknown[]) => mockServices.deactivateRosterPlayer(...args),
  reactivateRosterPlayer: (...args: unknown[]) => mockServices.reactivateRosterPlayer(...args),
}));
jest.mock('@/lib/services/roster/injury-flags', () => ({
  loadPlayerAvailability: (...args: unknown[]) => mockServices.loadPlayerAvailability(...args),
  addInjuryFlag: (...args: unknown[]) => mockServices.addInjuryFlag(...args),
  endInjuryFlag: (...args: unknown[]) => mockServices.endInjuryFlag(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET', body?: unknown) =>
  new Request('https://example.com/api/m/v1/teams/t1/players', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const team = { params: { teamId: 't1' } };
const player = { params: { teamId: 't1', playerId: 'p1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('roster player routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await createRoute(request('POST', {}), team)).status).toBe(401);
    expect((await playerRoute(request(), player)).status).toBe(401);
    expect((await updateRoute(request('PATCH', {}), player)).status).toBe(401);
    expect((await deactivateRoute(request('POST'), player)).status).toBe(401);
    expect((await reactivateRoute(request('POST', {}), player)).status).toBe(401);
    expect((await flagsRoute(request(), player)).status).toBe(401);
    expect((await addFlagRoute(request('POST', {}), player)).status).toBe(401);
    expect((await endFlagRoute(request('POST', {}), { params: { ...player.params, flagId: 'f1' } })).status).toBe(401);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should take the team and player from the path over the body', async () => {
    expect((await createRoute(request('POST', { firstName: 'Sam', teamId: 'other' }), team)).status).toBe(201);
    expect(mockServices.createRosterPlayer).toHaveBeenCalledWith(DB, 'u1', { firstName: 'Sam', teamId: 't1' });

    await updateRoute(request('PATCH', { lastName: 'Lee', playerId: 'other' }), player);
    expect(mockServices.updateRosterPlayer).toHaveBeenCalledWith(DB, 'u1', { lastName: 'Lee', teamId: 't1', playerId: 'p1' });

    await playerRoute(request(), player);
    expect(mockServices.loadRosterPlayer).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', playerId: 'p1' });
  });

  it('should deactivate as a deactivation and pass the reactivation jersey through', async () => {
    await deactivateRoute(request('POST', { reason: 'removed' }), player);
    expect(mockServices.deactivateRosterPlayer).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', playerId: 'p1', reason: 'deactivated' });

    await reactivateRoute(request('POST', { jerseyNumber: 9 }), player);
    expect(mockServices.reactivateRosterPlayer).toHaveBeenCalledWith(DB, 'u1', { jerseyNumber: 9, teamId: 't1', playerId: 'p1' });
  });

  it('should route the injury flags, and map a taken jersey to 409', async () => {
    await flagsRoute(request(), player);
    expect(mockServices.loadPlayerAvailability).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', playerId: 'p1' });

    expect((await addFlagRoute(request('POST', { injurySlug: 'shoulder' }), player)).status).toBe(201);
    expect(mockServices.addInjuryFlag).toHaveBeenCalledWith(DB, 'u1', { injurySlug: 'shoulder', teamId: 't1', playerId: 'p1' });

    await endFlagRoute(request('POST', { endDate: '2026-10-25', flagId: 'other' }), { params: { ...player.params, flagId: 'f1' } });
    expect(mockServices.endInjuryFlag).toHaveBeenCalledWith(DB, 'u1', { endDate: '2026-10-25', teamId: 't1', playerId: 'p1', flagId: 'f1' });

    mockServices.reactivateRosterPlayer.mockResolvedValue({ ok: false, code: 'conflict', error: 'Jersey #9 is already taken on this team.' });
    const response = await reactivateRoute(request('POST', { jerseyNumber: 9 }), player);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'Jersey #9 is already taken on this team.', code: 'conflict' });
  });
});
