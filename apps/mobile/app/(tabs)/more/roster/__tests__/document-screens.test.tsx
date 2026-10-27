import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { renderWithQuery } from '../../../../../src/__tests__/render-with-query';
import { ApiError } from '../../../../../src/lib/api-client';

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (...args: unknown[]) => mockPush(...args), back: () => mockBack() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ playerId: '22222222-2222-4222-8222-222222222222' }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
const mockRole = jest.fn();
jest.mock('../../../../../src/providers/RoleProvider', () => ({ useRole: () => mockRole() }));
jest.mock('../../../../../src/features/forms/DateTimeFields', () => ({ DateTimeFields: () => null }));
jest.mock('../../../../../src/features/stats/season-stats-api', () => ({ localToday: () => '2027-03-10' }));
const mockUseDocuments = jest.fn();
const mockApi = { upload: jest.fn(), remove: jest.fn(), url: jest.fn() };
jest.mock('../../../../../src/features/roster/documents-api', () => ({
  playerDocumentsQueryKey: (teamId: string, playerId: string) => ['roster', teamId, playerId, 'documents'],
  usePlayerDocuments: (...args: unknown[]) => mockUseDocuments(...args),
  uploadPlayerDocument: (...args: unknown[]) => mockApi.upload(...args),
  deletePlayerDocument: (...args: unknown[]) => mockApi.remove(...args),
  playerDocumentUrl: (...args: unknown[]) => mockApi.url(...args),
}));
const mockPick = jest.fn();
jest.mock('../../../../../src/features/roster/document-file', () => ({
  ...jest.requireActual('../../../../../src/features/roster/document-file'),
  pickDocumentFile: (...args: unknown[]) => mockPick(...args),
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const DocumentsScreen = require('../[playerId]/documents/index').default;
const UploadScreen = require('../[playerId]/documents/new').default;
const { DocumentFileError } = require('../../../../../src/features/roster/document-file');
/* eslint-enable @typescript-eslint/no-var-requires */

const TEAM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const data = (documents: object[] = []) => ({
  player: { id: PLAYER, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 },
  documentTypes: [
    { slug: 'liability_waiver', name: 'Liability waiver', requiresExpiration: true, isTeamType: false },
    { slug: 'travel_form', name: 'Travel form', requiresExpiration: false, isTeamType: true },
  ],
  documents,
});
const waiver = {
  id: 'd1',
  documentType: 'liability_waiver',
  title: '2027 Waiver',
  signedOn: '2027-03-01',
  expiresOn: '2027-03-20',
  notes: 'Signed at tryouts',
  uploadedAt: '2027-03-02T00:00:00Z',
  isCurrent: true,
};
const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
const pressAlertButton = (label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((b) => b.text === label)?.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRole.mockReturnValue({ activeTeam: { teamId: TEAM, isCoach: true, role: 'head_coach' }, loading: false });
  mockUseDocuments.mockReturnValue({ data: data([waiver, { ...waiver, id: 'd0', title: '2026 Waiver', isCurrent: false }]) });
});

describe('PlayerDocumentsScreen', () => {
  it('should list the documents with their type, dates and status', () => {
    renderWithQuery(<DocumentsScreen />);
    expect(screen.getByText('Documents (2)')).toBeTruthy();
    expect(screen.getByText('2027 Waiver')).toBeTruthy();
    expect(screen.getAllByText(/^Liability waiver · Signed .+ · Expires .+$/)).toHaveLength(2);
    expect(screen.getByText('Expires in 10 days')).toBeTruthy();
    expect(screen.getByText('Superseded')).toBeTruthy();
  });

  it('should open a document from a link to its file', async () => {
    mockApi.url.mockResolvedValue('https://files.example.com/d1.pdf');
    renderWithQuery(<DocumentsScreen />);
    fireEvent.press(screen.getByText('2027 Waiver'));
    expect(alertSpy).toHaveBeenLastCalledWith('2027 Waiver', 'Signed at tryouts', expect.any(Array));
    pressAlertButton('Open');
    await waitFor(() => expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://files.example.com/d1.pdf'));
    expect(mockApi.url).toHaveBeenCalledWith(TEAM, PLAYER, 'd1');
  });

  it('should delete a document once confirmed', async () => {
    mockApi.remove.mockResolvedValue({ documentId: 'd1' });
    renderWithQuery(<DocumentsScreen />);
    fireEvent.press(screen.getByText('2027 Waiver'));
    pressAlertButton('Delete');
    expect(mockApi.remove).not.toHaveBeenCalled();
    pressAlertButton('Delete');
    await waitFor(() => expect(mockApi.remove).toHaveBeenCalledWith(TEAM, PLAYER, 'd1'));
  });

  it('should offer an upload when there are none, and tell non-coaches documents are for coaches', () => {
    mockUseDocuments.mockReturnValue({ data: data() });
    const { unmount } = renderWithQuery(<DocumentsScreen />);
    fireEvent.press(screen.getByText('Upload a document'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/more/roster/[playerId]/documents/new', params: { playerId: PLAYER } });
    unmount();

    mockUseDocuments.mockReturnValue({ data: undefined, error: new ApiError('forbidden', 'Only coaches can manage player documents.') });
    renderWithQuery(<DocumentsScreen />);
    expect(screen.getByText('Coaches only')).toBeTruthy();
  });
});

describe('UploadPlayerDocumentScreen', () => {
  const file = { uri: 'file:///cache/waiver.pdf', name: 'waiver.pdf', mimeType: 'application/pdf', size: 2048 };

  it('should upload the picked file with its type, the title the type filled in, and notes', async () => {
    mockPick.mockResolvedValue(file);
    mockApi.upload.mockResolvedValue({ documentId: 'd2' });
    mockUseDocuments.mockReturnValue({ data: data() });
    renderWithQuery(<UploadScreen />);

    fireEvent.press(screen.getByText('Files'));
    expect(await screen.findByText('waiver.pdf')).toBeTruthy();
    expect(screen.getByText('2 KB')).toBeTruthy();
    fireEvent.press(screen.getByText('Liability waiver'));
    expect(screen.getByDisplayValue('Liability waiver')).toBeTruthy();
    expect(screen.getByText('Recommended for this type.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Notes'), ' Signed at tryouts ');
    fireEvent.press(screen.getByText('Upload document'));

    await waitFor(() =>
      expect(mockApi.upload).toHaveBeenCalledWith(
        TEAM,
        PLAYER,
        { documentType: 'liability_waiver', title: 'Liability waiver', signedOn: null, expiresOn: null, notes: 'Signed at tryouts' },
        file,
      ),
    );
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('should keep a title the coach wrote when they change the type', () => {
    renderWithQuery(<UploadScreen />);
    fireEvent.press(screen.getByText('Liability waiver'));
    fireEvent.changeText(screen.getByLabelText('Title'), 'Spring waiver');
    fireEvent.press(screen.getByText('Travel form (team)'));
    expect(screen.getByDisplayValue('Spring waiver')).toBeTruthy();
  });

  it('should ask for a file, then a type, before uploading', async () => {
    mockPick.mockResolvedValue(file);
    renderWithQuery(<UploadScreen />);
    fireEvent.press(screen.getByText('Upload document'));
    expect(screen.getByText('Pick a file to upload.')).toBeTruthy();

    fireEvent.press(screen.getByText('Photos'));
    await screen.findByText('waiver.pdf');
    fireEvent.press(screen.getByText('Upload document'));
    expect(screen.getByText('Pick a document type.')).toBeTruthy();
    expect(mockApi.upload).not.toHaveBeenCalled();
  });

  it('should explain a file it can’t use, and the server’s refusal', async () => {
    mockPick.mockRejectedValueOnce(new DocumentFileError('That file is too large (20 MB max).'));
    renderWithQuery(<UploadScreen />);
    fireEvent.press(screen.getByText('Camera'));
    expect(await screen.findByText('That file is too large (20 MB max).')).toBeTruthy();

    mockPick.mockResolvedValue(file);
    mockApi.upload.mockRejectedValue(new ApiError('invalid', 'Pick a document type from the list.'));
    fireEvent.press(screen.getByText('Files'));
    await screen.findByText('waiver.pdf');
    fireEvent.press(screen.getByText('Travel form (team)'));
    fireEvent.press(screen.getByText('Upload document'));
    expect(await screen.findByText('Pick a document type from the list.')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
