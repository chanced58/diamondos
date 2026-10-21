import { NextResponse } from 'next/server';
import { POST } from '../route';

const mockRequireApiUser = jest.fn();
const mockCreateTeamEvent = jest.fn();

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/team-events/create-team-event', () => ({
  createTeamEvent: (...args: unknown[]) => mockCreateTeamEvent(...args),
}));

const body = { teamId: 'team-1', title: 'Meeting', startsAt: '2026-10-21T18:00:00.000Z' };
const request = (payload: string = JSON.stringify(body)) =>
  new Request('https://example.com/api/m/v1/team-events', {
    method: 'POST',
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: payload,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'coach-1' }, db: { name: 'db' } });
});

it('should respond 401 without calling the service when unauthenticated', async () => {
  mockRequireApiUser.mockResolvedValue({
    response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
  });

  expect((await POST(request())).status).toBe(401);
  expect(mockCreateTeamEvent).not.toHaveBeenCalled();
});

it('should respond 201 with the event id for the bearer user', async () => {
  mockCreateTeamEvent.mockResolvedValue({ ok: true, data: { eventId: 'event-1' } });

  const res = await POST(request());

  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ eventId: 'event-1' });
  expect(mockCreateTeamEvent).toHaveBeenCalledWith({ name: 'db' }, 'coach-1', body);
});

it('should map a forbidden result to 403', async () => {
  mockCreateTeamEvent.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only coaches can create team events.' });

  const res = await POST(request());

  expect(res.status).toBe(403);
  expect(await res.json()).toEqual({ error: 'Only coaches can create team events.', code: 'forbidden' });
});

it('should map invalid input (including a non-JSON body) to 400', async () => {
  mockCreateTeamEvent.mockResolvedValue({ ok: false, code: 'invalid', error: 'Expected object, received undefined' });

  const res = await POST(request('not json'));

  expect(res.status).toBe(400);
  expect(mockCreateTeamEvent).toHaveBeenCalledWith({ name: 'db' }, 'coach-1', undefined);
});

it('should hide database detail on a failed result', async () => {
  mockCreateTeamEvent.mockResolvedValue({ ok: false, code: 'failed', error: 'Failed to create event: secret' });

  const res = await POST(request());

  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'Internal error', code: 'failed' });
});
