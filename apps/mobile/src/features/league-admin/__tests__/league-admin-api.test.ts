import {
  createLeaguePlayer,
  fetchLeaguePlayer,
  fetchLeaguePlayers,
  releaseLeaguePlayer,
  transferLeaguePlayer,
} from '../league-admin-api';
import type { ApiClient } from '../../../lib/api-client';

jest.mock('../../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const client = { get: jest.fn(), post: jest.fn() } as unknown as ApiClient & { get: jest.Mock; post: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  client.get.mockResolvedValue({});
  client.post.mockResolvedValue({});
});

describe('league-admin-api', () => {
  it('should read the league’s players and one player under the league', async () => {
    await fetchLeaguePlayers('l1', client);
    await fetchLeaguePlayer('l1', 'p 1', client);
    expect(client.get.mock.calls.map((call) => call[0])).toEqual(['/league-admin/l1/players', '/league-admin/l1/players/p%201']);
  });

  it('should register, move and release players', async () => {
    await createLeaguePlayer('l1', { firstName: 'Sam', lastName: 'Lee' }, client);
    await transferLeaguePlayer('l1', 'p1', { toTeamId: 't1', acceptJerseyClear: true }, client);
    await releaseLeaguePlayer('l1', 'p1', { reason: 'Moved away' }, client);
    expect(client.post.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['/league-admin/l1/players', { firstName: 'Sam', lastName: 'Lee' }],
      ['/league-admin/l1/players/p1/transfer', { toTeamId: 't1', acceptJerseyClear: true }],
      ['/league-admin/l1/players/p1/release', { reason: 'Moved away' }],
    ]);
  });
});
