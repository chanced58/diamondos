import { mapTeamMemberships } from '../team-memberships';

const rows = [
  { team_id: 'regular', role: 'head_coach', teams: { name: 'Huskies' } },
  { team_id: 'cup-team', role: 'head_coach', teams: [{ name: 'Idaho Natives' }] },
  { team_id: 'kid-team', role: 'parent', teams: null },
];

describe('mapTeamMemberships', () => {
  it('flags tournament-only teams so the switcher can label them', () => {
    const memberships = mapTeamMemberships(rows, new Map(), new Set(['cup-team']));
    expect(memberships.map((m) => [m.teamId, m.teamName, m.isTournamentTeam])).toEqual([
      ['regular', 'Huskies', false],
      ['cup-team', 'Idaho Natives', true],
      ['kid-team', 'Team', false],
    ]);
  });

  it('keeps coach and player linkage unchanged', () => {
    const memberships = mapTeamMemberships(rows, new Map([['kid-team', 'player-9']]), new Set());
    expect(memberships.map((m) => [m.isCoach, m.playerId])).toEqual([
      [true, undefined],
      [true, undefined],
      [false, 'player-9'],
    ]);
  });
});
