import { useQuery } from '@tanstack/react-query';
import {
  playerDocumentUrlResponseSchema,
  playerDocumentWriteResponseSchema,
  playerDocumentsResponseSchema,
  type PlayerDocumentWriteResponse,
  type PlayerDocumentsResponse,
} from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import type { PickedFile } from './document-file';

/**
 * A player's documents through
 * `/api/m/v1/teams/:teamId/players/:playerId/documents` (online-only, roster
 * managers): waivers, medical releases and other compliance files.
 */

/** Uploads can be large on a slow connection. */
const UPLOAD_TIMEOUT_MS = 120_000;

const documentsPath = (teamId: string, playerId: string) =>
  `/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}/documents`;

/** Cache key for one player's documents. */
export const playerDocumentsQueryKey = (teamId: string, playerId: string) => ['roster', teamId, playerId, 'documents'] as const;

export function fetchPlayerDocuments(teamId: string, playerId: string, client: ApiClient = apiClient): Promise<PlayerDocumentsResponse> {
  return client.get(documentsPath(teamId, playerId), playerDocumentsResponseSchema);
}

export interface NewPlayerDocument {
  documentType: string;
  title: string;
  signedOn: string | null;
  expiresOn: string | null;
  notes: string | null;
}

export function uploadPlayerDocument(
  teamId: string,
  playerId: string,
  document: NewPlayerDocument,
  file: PickedFile,
  client: ApiClient = apiClient,
): Promise<PlayerDocumentWriteResponse> {
  const form = new FormData();
  form.append('documentType', document.documentType);
  form.append('title', document.title);
  if (document.signedOn) form.append('signedOn', document.signedOn);
  if (document.expiresOn) form.append('expiresOn', document.expiresOn);
  if (document.notes) form.append('notes', document.notes);
  // React Native's FormData reads a file part from its uri.
  form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
  return client.postForm(documentsPath(teamId, playerId), form, playerDocumentWriteResponseSchema, UPLOAD_TIMEOUT_MS);
}

export function deletePlayerDocument(
  teamId: string,
  playerId: string,
  documentId: string,
  client: ApiClient = apiClient,
): Promise<PlayerDocumentWriteResponse> {
  return client.delete(`${documentsPath(teamId, playerId)}/${encodeURIComponent(documentId)}`, playerDocumentWriteResponseSchema);
}

/** A link to the file that works for a minute. */
export async function playerDocumentUrl(
  teamId: string,
  playerId: string,
  documentId: string,
  client: ApiClient = apiClient,
): Promise<string> {
  const { url } = await client.get(
    `${documentsPath(teamId, playerId)}/${encodeURIComponent(documentId)}/url`,
    playerDocumentUrlResponseSchema,
  );
  return url;
}

export function usePlayerDocuments(teamId: string | null, playerId: string) {
  return useQuery({
    queryKey: playerDocumentsQueryKey(teamId ?? '', playerId),
    queryFn: () => fetchPlayerDocuments(teamId as string, playerId),
    enabled: Boolean(teamId && playerId),
  });
}
