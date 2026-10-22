import JSZip from 'jszip';
import { fakeDb } from '../../__tests__/fake-db';
import { buildGameExport } from '../build-game-export';

const mockLoadGameStats = jest.fn();
jest.mock('@/lib/game-stats/load-game-stats', () => ({
  loadGameStats: (...args: unknown[]) => mockLoadGameStats(...args),
}));

const GAME_ID = '11111111-1111-4111-8111-111111111111';

const bundle = {
  game: { id: GAME_ID, opponentName: 'Eagles', scheduledAt: '2026-10-20T23:00:00.000Z', timeZone: 'America/Chicago' },
  teamName: 'Huskies',
  isHome: true,
  lineScore: { homeRuns: 5, awayRuns: 2 },
  roster: [],
  ourBatting: [],
  ourPitching: [],
  ourFielding: [],
};

const meta = (over: Record<string, unknown> = {}) => ({ data: { team_id: 'team-1', status: 'completed', opponent_name: 'Eagles', ...over } });

beforeEach(() => {
  mockLoadGameStats.mockReset().mockResolvedValue(bundle);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('buildGameExport', () => {
  it('should zip the player and team CSVs under a dated, slugged filename', async () => {
    const { db } = fakeDb({ 'games.select': meta(), 'team_members.select': { data: { role: 'head_coach' } } });
    const result = await buildGameExport(db, 'coach', { gameId: GAME_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.filename).toBe('home-team-huskies-vs-eagles-2026-10-20.zip');
    const zip = await JSZip.loadAsync(result.data.content);
    expect(Object.keys(zip.files).sort()).toEqual(['player-stats.csv', 'team-stats.csv']);
  });

  it('should refuse a team member who is not a coach, and hide the game from anyone else', async () => {
    const parent = fakeDb({ 'games.select': meta(), 'team_members.select': { data: { role: 'parent' } } });
    expect(await buildGameExport(parent.db, 'parent', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'forbidden' });

    const stranger = fakeDb({ 'games.select': meta(), 'team_members.select': { data: null } });
    expect(await buildGameExport(stranger.db, 'stranger', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'not_found' });
    expect(mockLoadGameStats).not.toHaveBeenCalled();
  });

  it('should refuse a game that has not started or has no opponent', async () => {
    const scheduled = fakeDb({ 'games.select': meta({ status: 'scheduled' }), 'team_members.select': { data: { role: 'head_coach' } } });
    expect(await buildGameExport(scheduled.db, 'coach', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'conflict' });

    const tbd = fakeDb({ 'games.select': meta({ opponent_name: null }), 'team_members.select': { data: { role: 'head_coach' } } });
    expect(await buildGameExport(tbd.db, 'coach', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'conflict' });
  });

  it('should report a failed game read as failed and reject a malformed id', async () => {
    const broken = fakeDb({ 'games.select': { error: { message: 'boom' } } });
    expect(await buildGameExport(broken.db, 'coach', { gameId: GAME_ID })).toMatchObject({ ok: false, code: 'failed' });
    expect(await buildGameExport(broken.db, 'coach', { gameId: 'nope' })).toMatchObject({ ok: false, code: 'invalid' });
  });
});
