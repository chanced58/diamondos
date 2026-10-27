import { deletePlayerDocument, playerDocumentUrl, uploadPlayerDocument } from '../documents-api';
import type { ApiClient } from '../../../lib/api-client';

jest.mock('../../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const client = {
  get: jest.fn(),
  postForm: jest.fn(),
  delete: jest.fn(),
} as unknown as ApiClient & { get: jest.Mock; postForm: jest.Mock; delete: jest.Mock };

/** Records parts as React Native's FormData takes them (Node's would stringify the file part). */
class RecordingFormData {
  parts: Array<[string, unknown]> = [];
  append(name: string, value: unknown) {
    this.parts.push([name, value]);
  }
}
const partsOf = (form: unknown) => Object.fromEntries((form as RecordingFormData).parts);

const globals = globalThis as unknown as { FormData: unknown };
const nodeFormData = globals.FormData;
beforeAll(() => {
  globals.FormData = RecordingFormData;
});
afterAll(() => {
  globals.FormData = nodeFormData;
});
beforeEach(() => jest.clearAllMocks());

describe('documents-api', () => {
  it('should post the fields and the file part as a form, with a long timeout', async () => {
    client.postForm.mockResolvedValue({ documentId: 'd1' });
    await uploadPlayerDocument(
      't1',
      'p1',
      { documentType: 'liability_waiver', title: 'Waiver', signedOn: '2027-03-01', expiresOn: null, notes: null },
      { uri: 'file:///tmp/waiver.pdf', name: 'waiver.pdf', mimeType: 'application/pdf', size: 1200 },
      client,
    );

    const [path, form, , timeoutMs] = client.postForm.mock.calls[0];
    expect(path).toBe('/teams/t1/players/p1/documents');
    expect(timeoutMs).toBe(120_000);
    expect(partsOf(form)).toEqual({
      documentType: 'liability_waiver',
      title: 'Waiver',
      signedOn: '2027-03-01',
      file: { uri: 'file:///tmp/waiver.pdf', name: 'waiver.pdf', type: 'application/pdf' },
    });
  });

  it('should delete a document and fetch a link to one', async () => {
    client.delete.mockResolvedValue({ documentId: 'd1' });
    client.get.mockResolvedValue({ url: 'https://files.example.com/d1.pdf' });

    await deletePlayerDocument('t1', 'p1', 'd1', client);
    expect(client.delete.mock.calls[0][0]).toBe('/teams/t1/players/p1/documents/d1');
    expect(await playerDocumentUrl('t1', 'p1', 'd1', client)).toBe('https://files.example.com/d1.pdf');
    expect(client.get.mock.calls[0][0]).toBe('/teams/t1/players/p1/documents/d1/url');
  });
});
