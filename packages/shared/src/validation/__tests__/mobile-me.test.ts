import { Feature, SubscriptionTier } from '../../constants/tiers';
import { meResponseSchema } from '../mobile-me';

const payload = {
  apiVersion: 1,
  user: { id: 'u1', email: 'coach@example.com', firstName: 'Pat', lastName: null },
  memberships: [
    {
      teamId: 't1',
      teamName: 'Huskies',
      organization: null,
      role: 'head_coach',
      playerId: null,
      isTournamentTeam: false,
      tier: 'starter',
      features: ['direct_messages', 'a_feature_from_a_newer_web'],
    },
  ],
  leagueRoles: [{ leagueId: 'l1', leagueName: 'Metro', leagueSlug: null, role: 'league_manager' }],
};

describe('meResponseSchema', () => {
  it('should parse a valid payload and drop features this app does not know', () => {
    const parsed = meResponseSchema.parse(payload);

    expect(parsed.memberships[0].tier).toBe(SubscriptionTier.STARTER);
    expect(parsed.memberships[0].features).toEqual([Feature.DIRECT_MESSAGES]);
  });

  it('should reject an unknown tier or league role', () => {
    expect(meResponseSchema.safeParse({
      ...payload,
      memberships: [{ ...payload.memberships[0], tier: 'platinum' }],
    }).success).toBe(false);
    expect(meResponseSchema.safeParse({
      ...payload,
      leagueRoles: [{ ...payload.leagueRoles[0], role: 'owner' }],
    }).success).toBe(false);
  });

  it('should ignore unknown top-level keys so the web can extend the payload', () => {
    const parsed = meResponseSchema.parse({ ...payload, somethingNew: true });

    expect(parsed).not.toHaveProperty('somethingNew');
  });
});
