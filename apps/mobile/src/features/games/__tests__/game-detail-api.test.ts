import type { ApiClient } from '../../../lib/api-client';
import {
  cancelGame,
  fetchGameDetail,
  recalculateScores,
  resetGame,
  setReconciliationOverride,
} from '../game-detail-api';

jest.mock('../../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

function fakeClient() {
  const get = jest.fn().mockResolvedValue({});
  const post = jest.fn().mockResolvedValue({});
  return { client: { get, post } as unknown as ApiClient, get, post };
}

it('should fetch the game detail with the response schema', async () => {
  const { client, get } = fakeClient();
  await fetchGameDetail('game-1', client);
  expect(get).toHaveBeenCalledWith('/games/game-1', expect.objectContaining({ safeParse: expect.any(Function) }));
});

it('should post each coach action to its route with its body', async () => {
  const { client, post } = fakeClient();

  await cancelGame('game-1', true, client);
  await resetGame('game-1', 'device-9', client);
  await recalculateScores('game-1', client);
  await setReconciliationOverride('recon-1', 'final_score:home', false, client);

  expect(post.mock.calls.map(([path, body]) => [path, body])).toEqual([
    ['/games/game-1/cancel', { notifyTeam: true }],
    ['/games/game-1/reset', { deviceId: 'device-9' }],
    ['/games/game-1/recalculate', {}],
    ['/reconciliations/recon-1/overrides', { conflictKey: 'final_score:home', useAwayValue: false }],
  ]);
});

it('should encode ids so a stray character cannot change the route', async () => {
  const { client, get } = fakeClient();
  await fetchGameDetail('a/b', client);
  expect(get.mock.calls[0][0]).toBe('/games/a%2Fb');
});
