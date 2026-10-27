import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { DocumentFileError, checkDocumentFile, formatFileSize, mimeTypeFor, pickDocumentFile } from '../document-file';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const picker = {
  getDocument: DocumentPicker.getDocumentAsync as jest.Mock,
  cameraPermission: ImagePicker.requestCameraPermissionsAsync as jest.Mock,
  camera: ImagePicker.launchCameraAsync as jest.Mock,
  library: ImagePicker.launchImageLibraryAsync as jest.Mock,
};

beforeEach(() => jest.clearAllMocks());

describe('document files', () => {
  it('should take the reported type, else read it from the extension', () => {
    expect(mimeTypeFor('scan.PDF')).toBe('application/pdf');
    expect(mimeTypeFor('photo.heic', 'image/heic')).toBe('image/heic');
    expect(mimeTypeFor('notes.txt')).toBe('application/octet-stream');
  });

  it('should size files in KB or MB', () => {
    expect(formatFileSize(300)).toBe('1 KB');
    expect(formatFileSize(840 * 1024)).toBe('840 KB');
    expect(formatFileSize(3.25 * 1024 * 1024)).toBe('3.3 MB');
  });

  it('should refuse what the server would', () => {
    const file = { uri: 'file:///a', name: 'a.pdf', mimeType: 'application/pdf', size: 10 };
    expect(checkDocumentFile(file)).toBe(file);
    expect(() => checkDocumentFile({ ...file, mimeType: 'text/plain' })).toThrow('Pick a PDF or an image.');
    expect(() => checkDocumentFile({ ...file, size: 21 * 1024 * 1024 })).toThrow('That file is too large (20 MB max).');
  });
});

describe('pickDocumentFile', () => {
  it('should pick a PDF or image from Files', async () => {
    picker.getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/waiver.pdf', name: 'waiver.pdf', mimeType: 'application/pdf', size: 2048 }],
    });
    expect(await pickDocumentFile('files')).toEqual({ uri: 'file:///cache/waiver.pdf', name: 'waiver.pdf', mimeType: 'application/pdf', size: 2048 });
    expect(picker.getDocument).toHaveBeenCalledWith({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  });

  it('should take a photo once the camera is allowed, and say so when it isn’t', async () => {
    picker.cameraPermission.mockResolvedValueOnce({ granted: true });
    picker.camera.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///photo', fileName: null, mimeType: undefined, fileSize: 5000 }] });
    expect(await pickDocumentFile('camera')).toEqual({ uri: 'file:///photo', name: 'photo.jpg', mimeType: 'image/jpeg', size: 5000 });

    picker.cameraPermission.mockResolvedValueOnce({ granted: false });
    await expect(pickDocumentFile('camera')).rejects.toBeInstanceOf(DocumentFileError);
  });

  it('should give nothing when the coach backs out', async () => {
    picker.library.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickDocumentFile('library')).toBeNull();
    expect(picker.cameraPermission).not.toHaveBeenCalled();
  });
});
