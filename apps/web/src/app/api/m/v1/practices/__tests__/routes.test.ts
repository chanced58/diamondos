import { NextResponse } from 'next/server';
import { GET as listRoute, POST as createRoute } from '../../teams/[teamId]/practices/route';
import { GET as detailRoute } from '../[practiceId]/route';
import { PATCH as planRoute } from '../[practiceId]/plan/route';
import { PUT as notesRoute } from '../[practiceId]/notes/route';
import { PUT as selfNotesRoute } from '../[practiceId]/self-notes/route';
import { POST as cancelRoute } from '../[practiceId]/cancel/route';
import { POST as repsRoute } from '../[practiceId]/reps/route';
import { GET as runReadRoute, POST as runRoute } from '../[practiceId]/run/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  listPractices: jest.fn(),
  createPractice: jest.fn(),
  cancelPractice: jest.fn(),
  loadPractice: jest.fn(),
  savePracticePlan: jest.fn(),
  savePracticeNotes: jest.fn(),
  savePracticeSelfNotes: jest.fn(),
  logPracticeRep: jest.fn(),
  loadPracticeRun: jest.fn(),
  runPractice: jest.fn(),
};

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
// A function declaration is hoisted with the mocks; it reads mockServices only when a route calls it.
function forward(name: keyof typeof mockServices) {
  return (...args: unknown[]) => mockServices[name](...args);
}
jest.mock('@/lib/services/practices/practices', () => ({
  listPractices: forward('listPractices'),
  createPractice: forward('createPractice'),
  cancelPractice: forward('cancelPractice'),
}));
jest.mock('@/lib/services/practices/load-practice', () => ({ loadPractice: forward('loadPractice') }));
jest.mock('@/lib/services/practices/practice-notes', () => ({
  savePracticePlan: forward('savePracticePlan'),
  savePracticeNotes: forward('savePracticeNotes'),
  savePracticeSelfNotes: forward('savePracticeSelfNotes'),
  logPracticeRep: forward('logPracticeRep'),
}));
jest.mock('@/lib/services/practices/practice-run', () => ({
  loadPracticeRun: forward('loadPracticeRun'),
  runPractice: forward('runPractice'),
}));

const DB = { name: 'db' };
const team = { params: { teamId: 't1' } };
const practice = { params: { practiceId: 'p1' } };
const request = (method: string, body?: unknown) =>
  new Request('https://example.com/api/m/v1/x', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('practice routes', () => {
  it('should respond 401 to every route without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      listRoute(request('GET'), team),
      createRoute(request('POST', {}), team),
      detailRoute(request('GET'), practice),
      planRoute(request('PATCH', {}), practice),
      notesRoute(request('PUT', {}), practice),
      selfNotesRoute(request('PUT', {}), practice),
      cancelRoute(request('POST', {}), practice),
      repsRoute(request('POST', {}), practice),
      runReadRoute(request('GET'), practice),
      runRoute(request('POST', {}), practice),
    ]);
    expect(responses.every((r) => r.status === 401)).toBe(true);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should create with the team from the path and answer 201', async () => {
    const response = await createRoute(request('POST', { teamId: 'spoofed', scheduledAt: 'x' }), team);
    expect(response.status).toBe(201);
    expect(mockServices.createPractice).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', scheduledAt: 'x' });
  });

  it('should always take the practice from the path, over any in the body', async () => {
    await runRoute(request('POST', { practiceId: 'spoofed', action: 'start' }), practice);
    expect(mockServices.runPractice).toHaveBeenCalledWith(DB, 'u1', { practiceId: 'p1', action: 'start' });

    await notesRoute(request('PUT', { overallNotes: 'x' }), practice);
    expect(mockServices.savePracticeNotes).toHaveBeenCalledWith(DB, 'u1', { practiceId: 'p1', overallNotes: 'x' });
  });

  it("should map a service's refusal to its status", async () => {
    mockServices.loadPractice.mockResolvedValue({ ok: false, code: 'not_found', error: 'Practice not found.' });
    mockServices.cancelPractice.mockResolvedValue({ ok: false, code: 'forbidden', error: 'Only coaches can cancel practices.' });
    expect((await detailRoute(request('GET'), practice)).status).toBe(404);
    expect((await cancelRoute(request('POST', {}), practice)).status).toBe(403);
  });
});
