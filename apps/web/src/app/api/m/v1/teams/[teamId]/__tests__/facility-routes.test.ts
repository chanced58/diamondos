import { NextResponse } from 'next/server';
import { GET as getSchedule, POST as postFacility } from '../facilities/route';
import { DELETE as deleteFacilityRoute } from '../facilities/[facilityId]/route';
import { POST as postBooking } from '../facility-bookings/route';
import { DELETE as deleteBookingRoute } from '../facility-bookings/[bookingId]/route';

const mockRequireApiUser = jest.fn();
const mockLoad = jest.fn();
const mockCreateFacility = jest.fn();
const mockDeleteFacility = jest.fn();
const mockCreateBooking = jest.fn();
const mockDeleteBooking = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/facilities/facilities', () => ({
  loadFacilitySchedule: (...args: unknown[]) => mockLoad(...args),
  createFacility: (...args: unknown[]) => mockCreateFacility(...args),
  deleteFacility: (...args: unknown[]) => mockDeleteFacility(...args),
  createBooking: (...args: unknown[]) => mockCreateBooking(...args),
  deleteBooking: (...args: unknown[]) => mockDeleteBooking(...args),
}));

const DB = { name: 'db' };
const teamParams = { params: { teamId: 'team-1' } };
const request = (method: string, url = 'https://example.com/api/m/v1/x', body?: unknown) =>
  new Request(url, {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ok = { ok: true, data: {} };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
});

describe('facility routes', () => {
  it('should respond 401 to every route without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      getSchedule(request('GET'), teamParams),
      postFacility(request('POST', undefined, {}), teamParams),
      deleteFacilityRoute(request('DELETE'), { params: { teamId: 'team-1', facilityId: 'f1' } }),
      postBooking(request('POST', undefined, {}), teamParams),
      deleteBookingRoute(request('DELETE'), { params: { teamId: 'team-1', bookingId: 'b1' } }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401]);
    for (const mock of [mockLoad, mockCreateFacility, mockDeleteFacility, mockCreateBooking, mockDeleteBooking]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });

  it('should read the window from the query and the team from the path', async () => {
    mockLoad.mockResolvedValue(ok);
    await getSchedule(request('GET', 'https://example.com/api/m/v1/teams/team-1/facilities?from=A&to=B'), teamParams);
    expect(mockLoad).toHaveBeenCalledWith(DB, 'u1', { teamId: 'team-1', from: 'A', to: 'B' });
  });

  it('should create with 201, the path team overriding the body, and map an overlap to 409', async () => {
    mockCreateFacility.mockResolvedValue({ ok: true, data: { facilityId: 'f1' } });
    const created = await postFacility(request('POST', undefined, { teamId: 'other', name: 'Cage' }), teamParams);
    expect(created.status).toBe(201);
    expect(mockCreateFacility).toHaveBeenCalledWith(DB, 'u1', { teamId: 'team-1', name: 'Cage' });

    mockCreateBooking.mockResolvedValue({ ok: false, code: 'conflict', error: 'Time conflict' });
    expect((await postBooking(request('POST', undefined, { teamId: 'other' }), teamParams)).status).toBe(409);
    expect(mockCreateBooking).toHaveBeenCalledWith(DB, 'u1', { teamId: 'team-1' });
  });

  it('should delete with the path ids', async () => {
    mockDeleteFacility.mockResolvedValue(ok);
    mockDeleteBooking.mockResolvedValue(ok);
    await deleteFacilityRoute(request('DELETE'), { params: { teamId: 'team-1', facilityId: 'f1' } });
    await deleteBookingRoute(request('DELETE'), { params: { teamId: 'team-1', bookingId: 'b1' } });
    expect(mockDeleteFacility).toHaveBeenCalledWith(DB, 'u1', { teamId: 'team-1', facilityId: 'f1' });
    expect(mockDeleteBooking).toHaveBeenCalledWith(DB, 'u1', { teamId: 'team-1', bookingId: 'b1' });
  });
});
