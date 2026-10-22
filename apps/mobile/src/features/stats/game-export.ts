import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ApiError, kindForStatus, MOBILE_API_PREFIX } from '../../lib/api-client';
import { getSupabaseClient } from '../../lib/supabase';

/**
 * Exports a game for GameChanger (Home Team): downloads the same ZIP of CSVs
 * the web stats page offers (`/api/m/v1/games/:gameId/export`) into the
 * cache, then hands it to the share sheet — Files, Mail, AirDrop.
 * Online-only; failures surface as `ApiError` like any API call.
 */

export interface GameExportDeps {
  baseUrl: string | undefined;
  getAccessToken: () => Promise<string | null>;
  cacheDirectory: string | null;
  makeDirectory: (uri: string) => Promise<void>;
  download: (
    url: string,
    fileUri: string,
    headers: Record<string, string>,
  ) => Promise<{ status: number; uri: string; headers: Record<string, string> }>;
  readText: (uri: string) => Promise<string>;
  /** Replaces `to` if it exists. */
  move: (from: string, to: string) => Promise<void>;
  isSharingAvailable: () => Promise<boolean>;
  share: (uri: string) => Promise<void>;
}

const defaultDeps: GameExportDeps = {
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  getAccessToken: async () => {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  },
  cacheDirectory: FileSystem.cacheDirectory,
  makeDirectory: (uri) => FileSystem.makeDirectoryAsync(uri, { intermediates: true }),
  download: (url, fileUri, headers) => FileSystem.downloadAsync(url, fileUri, { headers }),
  readText: (uri) => FileSystem.readAsStringAsync(uri),
  move: async (from, to) => {
    await FileSystem.deleteAsync(to, { idempotent: true });
    await FileSystem.moveAsync({ from, to });
  },
  isSharingAvailable: () => Sharing.isAvailableAsync(),
  share: (uri) =>
    Sharing.shareAsync(uri, {
      mimeType: 'application/zip',
      UTI: 'public.zip-archive',
      dialogTitle: 'Export for GameChanger',
    }),
};

/** The server's suggested filename, made safe for a cache path. */
export function exportFilename(contentDisposition: string | undefined, gameId: string): string {
  const named = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
  const safe = named?.replace(/[^A-Za-z0-9._-]/g, '-');
  return safe && safe.endsWith('.zip') ? safe : `game-${gameId}.zip`;
}

function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

export async function shareGameExport(gameId: string, deps: GameExportDeps = defaultDeps): Promise<void> {
  const baseUrl = deps.baseUrl?.trim().replace(/\/+$/, '');
  if (!baseUrl) throw new ApiError('not_configured', 'EXPO_PUBLIC_API_BASE_URL is not set');
  if (!deps.cacheDirectory) throw new ApiError('server', 'No cache directory on this device.');
  if (!(await deps.isSharingAvailable())) throw new ApiError('server', 'Sharing is not available on this device.');

  const token = await deps.getAccessToken();
  if (!token) throw new ApiError('unauthenticated', 'Not signed in');

  const folder = `${deps.cacheDirectory}exports/`;
  await deps.makeDirectory(folder);
  const pending = `${folder}game-${gameId}.download`;

  let result: Awaited<ReturnType<GameExportDeps['download']>>;
  try {
    result = await deps.download(
      `${baseUrl}${MOBILE_API_PREFIX}/games/${encodeURIComponent(gameId)}/export`,
      pending,
      { Authorization: `Bearer ${token}` },
    );
  } catch (err) {
    throw new ApiError('offline', `Export download failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (result.status < 200 || result.status >= 300) {
    // A failure body is the API's JSON `{ error, code }`, written to the file.
    const body = await deps
      .readText(result.uri)
      .then((text) => JSON.parse(text) as { error?: unknown; code?: unknown })
      .catch(() => ({}) as { error?: unknown; code?: unknown });
    throw new ApiError(
      kindForStatus(result.status),
      typeof body.error === 'string' ? body.error : `Export failed (${result.status})`,
      { status: result.status, code: typeof body.code === 'string' ? body.code : undefined },
    );
  }

  // The share sheet shows the file's name, so give it the server's.
  const named = `${folder}${exportFilename(header(result.headers, 'content-disposition'), gameId)}`;
  await deps.move(result.uri, named);
  await deps.share(named);
}
