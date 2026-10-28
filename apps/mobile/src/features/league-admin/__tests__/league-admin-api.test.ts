import {
  addLeagueDivision,
  createLeaguePlayer,
  fetchLeaguePlayer,
  fetchLeaguePlayers,
  fetchLeagueScoringSettings,
  fetchLeagueTeams,
  releaseLeaguePlayer,
  removeLeagueDivision,
  removeLeagueTeam,
  saveLeagueScoringSettings,
  setLeagueTeamActive,
  setLeagueTeamDivision,
  transferLeaguePlayer,
} from '../league-admin-api';
import { defaultLeagueScoringSettings } from '@baseball/shared';
import type { ApiClient } from '../../../lib/api-client';

jest.mock('../../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

const client = { get: jest.fn(), post: jest.fn(), delete: jest.fn() } as unknown as ApiClient & {
  get: jest.Mock;
  post: jest.Mock;
  delete: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  client.get.mockResolvedValue({});
  client.post.mockResolvedValue({});
  client.delete.mockResolvedValue({});
});

describe('league-admin-api teams and divisions', () => {
  it('should read the teams and change divisions and teams under the league', async () => {
    await fetchLeagueTeams('l1', client);
    await addLeagueDivision('l1', 'North', client);
    await removeLeagueDivision('l1', 'd1', client);
    await setLeagueTeamDivision('l1', 'm1', null, client);
    await setLeagueTeamActive('l1', 'm1', false, client);
    await removeLeagueTeam('l1', 'm1', client);
    expect(client.get.mock.calls[0][0]).toBe('/league-admin/l1/teams');
    expect(client.post.mock.calls.map((call) => [call[0], call[1]])).toEqual([
      ['/league-admin/l1/divisions', { name: 'North' }],
      ['/league-admin/l1/teams/m1/division', { divisionId: null }],
      ['/league-admin/l1/teams/m1/active', { isActive: false }],
    ]);
    expect(client.delete.mock.calls.map((call) => call[0])).toEqual(['/league-admin/l1/divisions/d1', '/league-admin/l1/teams/m1']);
  });
});

describe('league-admin-api scoring settings', () => {
  it('should read and save the whole settings blob under the league', async () => {
    const settings = defaultLeagueScoringSettings();
    await fetchLeagueScoringSettings('l1', client);
    await saveLeagueScoringSettings('l1', settings, client);
    expect(client.get.mock.calls[0][0]).toBe('/league-admin/l1/scoring-settings');
    expect(client.post.mock.calls[0].slice(0, 2)).toEqual(['/league-admin/l1/scoring-settings', { settings }]);
  });
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
