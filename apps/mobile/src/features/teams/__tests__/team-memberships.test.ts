import { Feature, SubscriptionTier } from '@baseball/shared';
import { mapMeMemberships, mapTeamMemberships } from '../team-memberships';

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

describe('mapMeMemberships', () => {
  it('carries tier and features from /me, and fails closed on the fallback path', () => {
    const [fromMe] = mapMeMemberships([
      {
        teamId: 'regular',
        teamName: 'Huskies',
        organization: null,
        role: 'assistant_coach',
        playerId: null,
        isTournamentTeam: false,
        tier: SubscriptionTier.STARTER,
        features: [Feature.DIRECT_MESSAGES],
      },
    ]);
    expect(fromMe).toEqual({
      teamId: 'regular',
      teamName: 'Huskies',
      role: 'assistant_coach',
      playerId: undefined,
      isCoach: true,
      isTournamentTeam: false,
      tier: SubscriptionTier.STARTER,
      features: [Feature.DIRECT_MESSAGES],
    });

    const [fallback] = mapTeamMemberships(rows, new Map(), new Set());
    expect([fallback.tier, fallback.features]).toEqual([null, []]);
  });
});
