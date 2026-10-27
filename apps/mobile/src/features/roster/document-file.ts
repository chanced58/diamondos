import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { PLAYER_DOCUMENT_MAX_BYTES, isAllowedDocumentContentType } from '@baseball/shared';

/**
 * Picking a player document's file: a photo of a signed form from the camera
 * or the photo library, or a PDF or image from Files. Native modules
 * (`expo-image-picker`, `expo-document-picker`), so adding or upgrading them
 * needs a native rebuild.
 */

export type DocumentSource = 'camera' | 'library' | 'files';

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
  /** Bytes, when the picker reports it. */
  size: number | null;
}

/** Thrown when a file can't be used; its message is for the coach. */
export class DocumentFileError extends Error {}

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
};

/** The file's type from the picker, else from its extension. */
export function mimeTypeFor(name: string, reported?: string | null): string {
  if (reported) return reported;
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/** "840 KB", "3.2 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Refuses what the server would: anything but a PDF or image, or over 20 MB. */
export function checkDocumentFile(file: PickedFile): PickedFile {
  if (!isAllowedDocumentContentType(file.mimeType)) throw new DocumentFileError('Pick a PDF or an image.');
  if (file.size !== null && file.size > PLAYER_DOCUMENT_MAX_BYTES) throw new DocumentFileError('That file is too large (20 MB max).');
  return file;
}

async function pickPhoto(source: 'camera' | 'library'): Promise<PickedFile | null> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new DocumentFileError('Allow camera access in Settings to photograph a document.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 };
  const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  const name = asset.fileName ?? 'photo.jpg';
  return { uri: asset.uri, name, mimeType: mimeTypeFor(name, asset.mimeType), size: asset.fileSize ?? null };
}

async function pickFromFiles(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, mimeType: mimeTypeFor(asset.name, asset.mimeType), size: asset.size ?? null };
}

/** The picked file, checked, or null when the coach backs out. */
export async function pickDocumentFile(source: DocumentSource): Promise<PickedFile | null> {
  const file = source === 'files' ? await pickFromFiles() : await pickPhoto(source);
  return file ? checkDocumentFile(file) : null;
}
