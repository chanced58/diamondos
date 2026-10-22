import { generatedScoutingCardResponseSchema, opponentTeamsResponseSchema } from '@baseball/shared';
import type { ApiClient } from '../../../lib/api-client';
import {
  SCOUTING_CARD_TIMEOUT_MS,
  addOpponentTeamPlayer,
  createOpponentTeam,
  fetchOpponentTeams,
  generateScoutingCard,
  removeOpponentTeamPlayer,
  updateOpponentTeam,
} from '../opponent-teams-api';

function client() {
  const calls = { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(), request: jest.fn() };
  for (const fn of Object.values(calls)) fn.mockResolvedValue({});
  return { client: calls as unknown as ApiClient, calls };
}

describe('opponent teams api', () => {
  it('should read and create a team’s opponents under the team', async () => {
    const { client: c, calls } = client();
    await fetchOpponentTeams('team 1', c);
    await createOpponentTeam('team 1', { name: 'Eagles' }, c);
    expect(calls.get).toHaveBeenCalledWith('/teams/team%201/opponent-teams', opponentTeamsResponseSchema);
    expect(calls.post).toHaveBeenCalledWith('/teams/team%201/opponent-teams', { name: 'Eagles' }, expect.anything());
  });

  it('should edit a team and its roster under the opponent team', async () => {
    const { client: c, calls } = client();
    await updateOpponentTeam('o1', { name: 'Eagles JV' }, c);
    await addOpponentTeamPlayer('o1', { firstName: 'X', lastName: 'Y', bats: 'left' }, c);
    await removeOpponentTeamPlayer('o1', 'p1', c);
    expect(calls.patch).toHaveBeenCalledWith('/opponent-teams/o1', { name: 'Eagles JV' }, expect.anything());
    expect(calls.post).toHaveBeenCalledWith('/opponent-teams/o1/players', { firstName: 'X', lastName: 'Y', bats: 'left' }, expect.anything());
    expect(calls.delete).toHaveBeenCalledWith('/opponent-teams/o1/players/p1', expect.anything());
  });

  it('should give scouting card generation a long timeout', async () => {
    const { client: c, calls } = client();
    await generateScoutingCard('o1', c);
    expect(calls.request).toHaveBeenCalledWith('/opponent-teams/o1/scouting-card', {
      method: 'POST',
      schema: generatedScoutingCardResponseSchema,
      timeoutMs: SCOUTING_CARD_TIMEOUT_MS,
    });
    expect(SCOUTING_CARD_TIMEOUT_MS).toBeGreaterThanOrEqual(120_000);
  });
});
