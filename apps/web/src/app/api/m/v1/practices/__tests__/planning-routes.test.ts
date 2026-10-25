import { NextResponse } from 'next/server';
import { POST as aiPreviewRoute } from '../../teams/[teamId]/practices/ai-preview/route';
import { POST as aiCreateRoute } from '../../teams/[teamId]/practices/ai/route';
import { GET as prepPreviewRoute, POST as prepCreateRoute } from '../../teams/[teamId]/practice-prep/route';
import { GET as templatesRoute } from '../../teams/[teamId]/practice-templates/route';
import { POST as duplicateRoute } from '../../practice-templates/[templateId]/duplicate/route';
import { POST as archiveRoute } from '../../practice-templates/[templateId]/archive/route';
import { GET as summaryRoute, POST as generateSummaryRoute } from '../[practiceId]/summary/route';
import { POST as applyTemplateRoute } from '../[practiceId]/apply-template/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  previewAiPractice: jest.fn(),
  createPracticeFromAiPlan: jest.fn(),
  loadPrepPreview: jest.fn(),
  createPrepPracticeFromPlan: jest.fn(),
  listPracticeTemplates: jest.fn(),
  duplicatePracticeTemplate: jest.fn(),
  archivePracticeTemplate: jest.fn(),
  applyPracticeTemplate: jest.fn(),
  loadPracticeSummary: jest.fn(),
  generatePracticeSummary: jest.fn(),
};

jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
// A function declaration is hoisted with the mocks; it reads mockServices only when a route calls it.
function forward(name: keyof typeof mockServices) {
  return (...args: unknown[]) => mockServices[name](...args);
}
jest.mock('@/lib/services/practices/ai-practice', () => ({
  previewAiPractice: forward('previewAiPractice'),
  createPracticeFromAiPlan: forward('createPracticeFromAiPlan'),
}));
jest.mock('@/lib/services/practices/prep-practice', () => ({
  loadPrepPreview: forward('loadPrepPreview'),
  createPrepPracticeFromPlan: forward('createPrepPracticeFromPlan'),
}));
jest.mock('@/lib/services/practices/practice-templates', () => ({
  listPracticeTemplates: forward('listPracticeTemplates'),
  duplicatePracticeTemplate: forward('duplicatePracticeTemplate'),
  archivePracticeTemplate: forward('archivePracticeTemplate'),
  applyPracticeTemplate: forward('applyPracticeTemplate'),
}));
jest.mock('@/lib/services/practices/practice-summary', () => ({
  loadPracticeSummary: forward('loadPracticeSummary'),
  generatePracticeSummary: forward('generatePracticeSummary'),
}));

const DB = { name: 'db' };
const team = { params: { teamId: 't1' } };
const template = { params: { templateId: 'tpl1' } };
const practice = { params: { practiceId: 'p1' } };
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

describe('practice planning routes', () => {
  it('should respond 401 to every route without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      aiPreviewRoute(request('POST', {}), team),
      aiCreateRoute(request('POST', {}), team),
      prepPreviewRoute(request('GET'), team),
      prepCreateRoute(request('POST', {}), team),
      templatesRoute(request('GET'), team),
      duplicateRoute(request('POST', {}), template),
      archiveRoute(request('POST'), template),
      summaryRoute(request('GET'), practice),
      generateSummaryRoute(request('POST', {}), practice),
      applyTemplateRoute(request('POST', {}), practice),
    ]);
    expect(responses.every((r) => r.status === 401)).toBe(true);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should take the team and template from the path and answer 201 on creates', async () => {
    expect((await aiCreateRoute(request('POST', { teamId: 'spoofed', durationMinutes: 90 }), team)).status).toBe(201);
    expect(mockServices.createPracticeFromAiPlan).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', durationMinutes: 90 });

    expect((await duplicateRoute(request('POST', { templateId: 'spoofed', newName: 'Copy' }), template)).status).toBe(201);
    expect(mockServices.duplicatePracticeTemplate).toHaveBeenCalledWith(DB, 'u1', { templateId: 'tpl1', newName: 'Copy' });

    await applyTemplateRoute(request('POST', { practiceId: 'spoofed', templateId: 'tpl1' }), practice);
    expect(mockServices.applyPracticeTemplate).toHaveBeenCalledWith(DB, 'u1', { practiceId: 'p1', templateId: 'tpl1' });
  });

  it('should read the prep options from the query', async () => {
    await prepPreviewRoute(request('GET', undefined, 'https://example.com/api/m/v1/x?duration=120&sourceGameId=g1'), team);
    expect(mockServices.loadPrepPreview).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', durationMinutes: '120', sourceGameId: 'g1' });

    await prepPreviewRoute(request('GET'), team);
    expect(mockServices.loadPrepPreview).toHaveBeenLastCalledWith(DB, 'u1', { teamId: 't1', durationMinutes: undefined, sourceGameId: null });
  });
});
