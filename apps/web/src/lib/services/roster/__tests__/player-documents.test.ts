import { deletePlayerDocument, loadPlayerDocuments, playerDocumentUrl, uploadPlayerDocument } from '../player-documents';
import { fakeDb, type FakeResult } from '../../__tests__/fake-db';

const mockGetRosterAccess = jest.fn();
jest.mock('@/lib/roster-access', () => ({
  getRosterAccess: (...args: unknown[]) => mockGetRosterAccess(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const DOC = '33333333-3333-4333-8333-333333333333';
const player = { data: { id: PLAYER, first_name: 'Sam', last_name: 'Lee', jersey_number: 7 } };
const ids = { teamId: TEAM, playerId: PLAYER };
const fields = (extra = {}) => ({ ...ids, documentType: 'liability_waiver', title: '2027 Waiver', signedOn: '2027-03-01', expiresOn: '', ...extra });
const pdf = (size = 4) => ({ size, contentType: 'application/pdf', read: jest.fn(async () => new Uint8Array(size)) });

/** fakeDb plus a storage bucket fake that records its calls. */
function withStorage(results: Parameters<typeof fakeDb>[0], storage: { upload?: FakeResult; remove?: FakeResult; sign?: FakeResult } = {}) {
  const fake = fakeDb(results);
  const bucketCalls: Array<{ bucket: string; op: string; args: unknown[] }> = [];
  const respond = (result: FakeResult | undefined) => Promise.resolve({ data: null, error: null, ...result });
  (fake.db as unknown as { storage: unknown }).storage = {
    from: (bucket: string) => ({
      upload: (...args: unknown[]) => (bucketCalls.push({ bucket, op: 'upload', args }), respond(storage.upload)),
      remove: (...args: unknown[]) => (bucketCalls.push({ bucket, op: 'remove', args }), respond(storage.remove)),
      createSignedUrl: (...args: unknown[]) => (bucketCalls.push({ bucket, op: 'sign', args }), respond(storage.sign)),
    }),
  };
  return { ...fake, bucketCalls };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetRosterAccess.mockResolvedValue({ canView: true, canManage: true, role: 'head_coach' });
});

describe('loadPlayerDocuments', () => {
  it('should return the player’s documents and the team’s document types', async () => {
    const { db, calls } = withStorage({
      'players.select': player,
      'player_document_type.select': {
        data: [
          { slug: 'liability_waiver', name: 'Liability waiver', requires_expiration: true, visibility: 'system' },
          { slug: 'travel_form', name: 'Travel form', requires_expiration: false, visibility: 'team' },
        ],
      },
      'player_documents.select': {
        data: [
          { id: DOC, document_type: 'liability_waiver', title: 'Waiver', signed_on: '2027-03-01', expires_on: null, notes: null, uploaded_at: '2027-03-02T00:00:00Z', is_current: true },
        ],
      },
    });
    const result = await loadPlayerDocuments(db, 'u1', ids);
    expect(result).toEqual({
      ok: true,
      data: {
        player: { id: PLAYER, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 },
        documentTypes: [
          { slug: 'liability_waiver', name: 'Liability waiver', requiresExpiration: true, isTeamType: false },
          { slug: 'travel_form', name: 'Travel form', requiresExpiration: false, isTeamType: true },
        ],
        documents: [
          { id: DOC, documentType: 'liability_waiver', title: 'Waiver', signedOn: '2027-03-01', expiresOn: null, notes: null, uploadedAt: '2027-03-02T00:00:00Z', isCurrent: true },
        ],
      },
    });
    expect(calls.find((c) => c.table === 'player_document_type')?.filters.or).toBe(`visibility.eq.system,team_id.eq.${TEAM}`);
    expect(calls.find((c) => c.table === 'player_documents')?.filters).toEqual({ player_id: PLAYER, team_id: TEAM });
  });

  it('should refuse team members who can’t manage, and hide the player from strangers', async () => {
    mockGetRosterAccess.mockResolvedValueOnce({ canView: true, canManage: false, role: 'parent' });
    mockGetRosterAccess.mockResolvedValueOnce({ canView: false, canManage: false, role: null });
    const { db, calls } = withStorage({ 'players.select': player });
    expect(await loadPlayerDocuments(db, 'u1', ids)).toMatchObject({ code: 'forbidden', error: 'Only coaches can manage player documents.' });
    expect(await loadPlayerDocuments(db, 'u1', ids)).toMatchObject({ code: 'not_found' });
    expect(calls).toHaveLength(0);
  });
});

describe('uploadPlayerDocument', () => {
  it('should store the file under the team and player, then record it as current', async () => {
    const file = pdf();
    const { db, calls, bucketCalls } = withStorage({ 'players.select': player, 'player_document_type.select': { data: { slug: 'liability_waiver' } } });
    const result = await uploadPlayerDocument(db, 'u1', fields({ notes: ' Signed at tryouts ' }), file);

    expect(result.ok).toBe(true);
    const documentId = result.ok ? result.data.documentId : '';
    expect(bucketCalls).toEqual([
      { bucket: 'player-documents', op: 'upload', args: [`${TEAM}/${PLAYER}/${documentId}.pdf`, new Uint8Array(4), { contentType: 'application/pdf', upsert: false }] },
    ]);
    expect(calls.find((c) => c.table === 'player_documents')?.payload).toEqual({
      id: documentId,
      team_id: TEAM,
      player_id: PLAYER,
      document_type: 'liability_waiver',
      title: '2027 Waiver',
      storage_path: `${TEAM}/${PLAYER}/${documentId}.pdf`,
      signed_on: '2027-03-01',
      expires_on: null,
      notes: 'Signed at tryouts',
      uploaded_by: 'u1',
      is_current: true,
    });
  });

  it('should refuse a missing, oversized or unsupported file before reading it', async () => {
    const { db, calls } = withStorage({});
    const big = pdf(20 * 1024 * 1024 + 1);
    const zip = { ...pdf(), contentType: 'application/zip' };
    expect(await uploadPlayerDocument(db, 'u1', fields(), null)).toMatchObject({ code: 'invalid', error: 'Pick a file to upload.' });
    expect(await uploadPlayerDocument(db, 'u1', fields(), big)).toMatchObject({ code: 'invalid', error: 'That file is too large (20 MB max).' });
    expect(await uploadPlayerDocument(db, 'u1', fields(), zip)).toMatchObject({ code: 'invalid', error: 'Upload a PDF or an image.' });
    expect(big.read).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('should refuse a type that isn’t the system’s or the team’s', async () => {
    const { db, bucketCalls } = withStorage({ 'players.select': player, 'player_document_type.select': { data: null } });
    expect(await uploadPlayerDocument(db, 'u1', fields({ documentType: 'other_team_form' }), pdf())).toMatchObject({
      code: 'invalid',
      error: 'Pick a document type from the list.',
    });
    expect(bucketCalls).toHaveLength(0);
  });

  it('should take the file back out when the record can’t be saved', async () => {
    const { db, bucketCalls } = withStorage({
      'players.select': player,
      'player_document_type.select': { data: { slug: 'liability_waiver' } },
      'player_documents.insert': { error: { message: 'boom' } },
    });
    expect(await uploadPlayerDocument(db, 'u1', fields(), pdf())).toMatchObject({ code: 'failed' });
    expect(bucketCalls.map((c) => c.op)).toEqual(['upload', 'remove']);
    expect(bucketCalls[1].args[0]).toEqual([bucketCalls[0].args[0]]);
  });

  it('should not record a document whose file didn’t upload', async () => {
    const { db, calls } = withStorage(
      { 'players.select': player, 'player_document_type.select': { data: { slug: 'liability_waiver' } } },
      { upload: { error: { message: 'storage down' } } },
    );
    expect(await uploadPlayerDocument(db, 'u1', fields(), pdf())).toMatchObject({ code: 'failed' });
    expect(calls.some((c) => c.table === 'player_documents')).toBe(false);
  });
});

describe('deletePlayerDocument', () => {
  const docIds = { ...ids, documentId: DOC };

  it('should delete the record, then its file', async () => {
    const { db, calls, bucketCalls } = withStorage({
      'players.select': player,
      'player_documents.select': { data: { storage_path: `${TEAM}/${PLAYER}/${DOC}.pdf` } },
    });
    expect(await deletePlayerDocument(db, 'u1', docIds)).toEqual({ ok: true, data: { documentId: DOC } });
    expect(calls.find((c) => c.table === 'player_documents' && c.op === 'select')?.filters).toEqual({ id: DOC, player_id: PLAYER, team_id: TEAM });
    expect(calls.find((c) => c.table === 'player_documents' && c.op === 'delete')?.filters).toEqual({ id: DOC, player_id: PLAYER });
    expect(bucketCalls).toEqual([{ bucket: 'player-documents', op: 'remove', args: [[`${TEAM}/${PLAYER}/${DOC}.pdf`]] }]);
  });

  it('should say not found for another player’s document, and keep the file when the record stays', async () => {
    const missing = withStorage({ 'players.select': player, 'player_documents.select': { data: null } });
    expect(await deletePlayerDocument(missing.db, 'u1', docIds)).toMatchObject({ code: 'not_found' });

    const stuck = withStorage({
      'players.select': player,
      'player_documents.select': { data: { storage_path: 'path.pdf' } },
      'player_documents.delete': { error: { message: 'boom' } },
    });
    expect(await deletePlayerDocument(stuck.db, 'u1', docIds)).toMatchObject({ code: 'failed' });
    expect(stuck.bucketCalls).toHaveLength(0);
  });
});

describe('playerDocumentUrl', () => {
  it('should sign a link to the file for a minute', async () => {
    const { db, bucketCalls } = withStorage(
      { 'players.select': player, 'player_documents.select': { data: { storage_path: 'path.pdf' } } },
      { sign: { data: { signedUrl: 'https://files.example.com/path.pdf?token=t' } } },
    );
    expect(await playerDocumentUrl(db, 'u1', { ...ids, documentId: DOC })).toEqual({
      ok: true,
      data: { url: 'https://files.example.com/path.pdf?token=t' },
    });
    expect(bucketCalls).toEqual([{ bucket: 'player-documents', op: 'sign', args: ['path.pdf', 60] }]);
  });
});
