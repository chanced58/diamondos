import {
  documentExtension,
  isAllowedDocumentContentType,
  playerDocumentStatus,
  uploadPlayerDocumentInputSchema,
} from '../player-documents';

const TEAM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';

describe('uploadPlayerDocumentInputSchema', () => {
  const parse = (input: object) =>
    uploadPlayerDocumentInputSchema.safeParse({ teamId: TEAM, playerId: PLAYER, documentType: 'liability_waiver', title: 'Waiver', ...input });

  it('should trim the title and notes and read blank dates and notes as none', () => {
    const result = parse({ title: '  2027 Waiver ', signedOn: '', expiresOn: '', notes: '   ' });
    expect(result.success && result.data).toMatchObject({ title: '2027 Waiver', signedOn: null, expiresOn: null, notes: null });
  });

  it('should ask for a type and a title when they are missing', () => {
    const issues = (input: object) => {
      const result = parse(input);
      return result.success ? [] : result.error.issues.map((issue) => issue.message);
    };
    expect(issues({ documentType: undefined })).toContain('Pick a document type.');
    expect(issues({ title: '  ' })).toContain('Add a title.');
  });

  it('should refuse an expiration before the signed date', () => {
    const result = parse({ signedOn: '2027-03-01', expiresOn: '2027-02-28' });
    expect(result.success ? null : result.error.issues[0].message).toBe('Expiration must be on or after the signed date.');
    expect(parse({ signedOn: '2027-03-01', expiresOn: '2027-03-01' }).success).toBe(true);
  });
});

describe('document files', () => {
  it('should accept PDFs and images only', () => {
    expect(isAllowedDocumentContentType('application/pdf')).toBe(true);
    expect(isAllowedDocumentContentType('image/heic')).toBe(true);
    expect(isAllowedDocumentContentType('application/zip')).toBe(false);
  });

  it('should store each type under its extension', () => {
    expect(documentExtension('application/pdf')).toBe('pdf');
    expect(documentExtension('image/jpeg')).toBe('jpg');
    expect(documentExtension('image/gif')).toBe('bin');
  });
});

describe('playerDocumentStatus', () => {
  const today = '2027-03-10';
  it('should mark a replaced document superseded, whatever its dates', () => {
    expect(playerDocumentStatus({ isCurrent: false, expiresOn: '2020-01-01' }, today)).toEqual({ label: 'Superseded', tone: 'default' });
  });

  it('should read a current document by its expiration', () => {
    const status = (expiresOn: string | null) => playerDocumentStatus({ isCurrent: true, expiresOn }, today);
    expect(status(null)).toEqual({ label: 'Current', tone: 'default' });
    expect(status('2027-03-09')).toEqual({ label: 'Expired', tone: 'danger' });
    expect(status('2027-03-10')).toEqual({ label: 'Expires today', tone: 'warning' });
    expect(status('2027-03-11')).toEqual({ label: 'Expires in 1 day', tone: 'warning' });
    expect(status('2027-04-09')).toEqual({ label: 'Expires in 30 days', tone: 'warning' });
    expect(status('2027-04-10')).toEqual({ label: 'OK', tone: 'safe' });
  });
});
