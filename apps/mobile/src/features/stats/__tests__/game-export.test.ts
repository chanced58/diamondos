import { ApiError } from '../../../lib/api-client';
import { exportFilename, shareGameExport, type GameExportDeps } from '../game-export';

jest.mock('expo-file-system', () => ({ cacheDirectory: 'file:///cache/' }));
jest.mock('expo-sharing', () => ({}));
jest.mock('../../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

function deps(over: Partial<GameExportDeps> = {}): GameExportDeps & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = { download: [], move: [], share: [] };
  return {
    baseUrl: 'https://app.example.com/',
    getAccessToken: async () => 'token',
    cacheDirectory: 'file:///cache/',
    makeDirectory: async () => {},
    download: async (...args) => {
      calls.download.push(args);
      return { status: 200, uri: args[1], headers: { 'Content-Disposition': 'attachment; filename="home-team-a-vs-b-2026-10-20.zip"' } };
    },
    readText: async () => '',
    move: async (...args) => {
      calls.move.push(args);
    },
    isSharingAvailable: async () => true,
    share: async (...args) => {
      calls.share.push(args);
    },
    ...over,
    calls,
  };
}

describe('shareGameExport', () => {
  it('should download with the bearer token, name the file as the server does, and share it', async () => {
    const d = deps();
    await shareGameExport('g1', d);

    expect(d.calls.download[0]).toEqual([
      'https://app.example.com/api/m/v1/games/g1/export',
      'file:///cache/exports/game-g1.download',
      { Authorization: 'Bearer token' },
    ]);
    expect(d.calls.move[0]).toEqual(['file:///cache/exports/game-g1.download', 'file:///cache/exports/home-team-a-vs-b-2026-10-20.zip']);
    expect(d.calls.share[0]).toEqual(['file:///cache/exports/home-team-a-vs-b-2026-10-20.zip']);
  });

  it("should turn the server's JSON error into a typed ApiError and share nothing", async () => {
    const d = deps({
      download: async (_url, uri) => ({ status: 409, uri, headers: {} }),
      readText: async () => JSON.stringify({ error: 'Set the opponent before exporting.', code: 'conflict' }),
    });
    const error = await shareGameExport('g1', d).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'conflict', status: 409, message: 'Set the opponent before exporting.' });
    expect(d.calls.share).toHaveLength(0);
  });

  it('should report a failed download as offline and a missing session as unauthenticated', async () => {
    const offline = deps({ download: async () => { throw new Error('network down'); } });
    await expect(shareGameExport('g1', offline)).rejects.toMatchObject({ kind: 'offline' });

    const signedOut = deps({ getAccessToken: async () => null });
    await expect(shareGameExport('g1', signedOut)).rejects.toMatchObject({ kind: 'unauthenticated' });
    expect(signedOut.calls.download).toHaveLength(0);
  });
});

describe('exportFilename', () => {
  it("should keep the server's zip name, made path-safe, and fall back for anything else", () => {
    expect(exportFilename('attachment; filename="home-team-a-vs-b.zip"', 'g1')).toBe('home-team-a-vs-b.zip');
    expect(exportFilename('attachment; filename="../../evil.zip"', 'g1')).toBe('..-..-evil.zip');
    expect(exportFilename(undefined, 'g1')).toBe('game-g1.zip');
    expect(exportFilename('attachment; filename="notes.txt"', 'g1')).toBe('game-g1.zip');
  });
});
