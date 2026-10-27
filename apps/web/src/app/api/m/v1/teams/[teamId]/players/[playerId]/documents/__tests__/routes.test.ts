import { NextResponse } from 'next/server';
import { GET as listRoute, POST as uploadRoute } from '../route';
import { DELETE as deleteRoute } from '../[documentId]/route';
import { GET as urlRoute } from '../[documentId]/url/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  loadPlayerDocuments: jest.fn(),
  uploadPlayerDocument: jest.fn(),
  deletePlayerDocument: jest.fn(),
  playerDocumentUrl: jest.fn(),
};
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/roster/player-documents', () => ({
  loadPlayerDocuments: (...args: unknown[]) => mockServices.loadPlayerDocuments(...args),
  uploadPlayerDocument: (...args: unknown[]) => mockServices.uploadPlayerDocument(...args),
  deletePlayerDocument: (...args: unknown[]) => mockServices.deletePlayerDocument(...args),
  playerDocumentUrl: (...args: unknown[]) => mockServices.playerDocumentUrl(...args),
}));

const DB = { name: 'db' };
const URL_BASE = 'https://example.com/api/m/v1/teams/t1/players/p1/documents';
const request = (method = 'GET', body?: BodyInit, headers: Record<string, string> = {}) =>
  new Request(URL_BASE, { method, headers: { authorization: 'Bearer token', ...headers }, body });
const player = { params: { teamId: 't1', playerId: 'p1' } };
const document = { params: { teamId: 't1', playerId: 'p1', documentId: 'd1' } };

function uploadForm(withFile = true) {
  const form = new FormData();
  form.append('documentType', 'liability_waiver');
  form.append('title', 'Waiver');
  form.append('signedOn', '2027-03-01');
  if (withFile) form.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }), 'waiver.pdf');
  return form;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('player document routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    expect((await listRoute(request(), player)).status).toBe(401);
    expect((await uploadRoute(request('POST', uploadForm()), player)).status).toBe(401);
    expect((await deleteRoute(request('DELETE'), document)).status).toBe(401);
    expect((await urlRoute(request(), document)).status).toBe(401);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should list a player’s documents', async () => {
    await listRoute(request(), player);
    expect(mockServices.loadPlayerDocuments).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', playerId: 'p1' });
  });

  it('should hand the form fields and the file to the upload service, responding 201', async () => {
    const response = await uploadRoute(request('POST', uploadForm()), player);
    expect(response.status).toBe(201);
    const [, actor, input, file] = mockServices.uploadPlayerDocument.mock.calls[0];
    expect(actor).toBe('u1');
    expect(input).toEqual({
      teamId: 't1',
      playerId: 'p1',
      documentType: 'liability_waiver',
      title: 'Waiver',
      signedOn: '2027-03-01',
      expiresOn: undefined,
      notes: undefined,
    });
    expect(file).toMatchObject({ size: 3, contentType: 'application/pdf' });
    expect(Array.from(await file.read())).toEqual([1, 2, 3]);
  });

  it('should pass no file when the form has none', async () => {
    await uploadRoute(request('POST', uploadForm(false)), player);
    expect(mockServices.uploadPlayerDocument.mock.calls[0][3]).toBeNull();
  });

  it('should refuse a body that isn’t a form, or is larger than any allowed file', async () => {
    const json = await uploadRoute(request('POST', '{}', { 'content-type': 'application/json' }), player);
    expect(json.status).toBe(400);
    expect(await json.json()).toEqual({ error: 'Send the document as multipart form data.', code: 'invalid' });

    const huge = await uploadRoute(request('POST', uploadForm(), { 'content-length': String(22 * 1024 * 1024) }), player);
    expect(huge.status).toBe(400);
    expect(mockServices.uploadPlayerDocument).not.toHaveBeenCalled();
  });

  it('should delete a document and sign a link to one', async () => {
    await deleteRoute(request('DELETE'), document);
    expect(mockServices.deletePlayerDocument).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', playerId: 'p1', documentId: 'd1' });
    mockServices.playerDocumentUrl.mockResolvedValue({ ok: false, code: 'not_found', error: 'Document not found.' });
    expect((await urlRoute(request(), document)).status).toBe(404);
    expect(mockServices.playerDocumentUrl).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', playerId: 'p1', documentId: 'd1' });
  });
});
