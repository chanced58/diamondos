import { inviteParentInputSchema, invitePlayerInputSchema, inviteStaffInputSchema, updateMemberRoleInputSchema } from '../team-members';

const TEAM = '11111111-1111-4111-8111-111111111111';
const CHILD = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';

describe('team member contracts', () => {
  it('should read blank staff fields as null and tidy the email', () => {
    expect(inviteStaffInputSchema.parse({ teamId: TEAM, email: ' Pat@Example.COM ', role: 'scorekeeper', firstName: ' ', jerseyNumber: '' })).toEqual({
      teamId: TEAM,
      email: 'pat@example.com',
      role: 'scorekeeper',
      firstName: null,
      lastName: null,
      phone: null,
      jerseyNumber: null,
    });
  });

  it('should only invite staff roles', () => {
    expect(inviteStaffInputSchema.safeParse({ teamId: TEAM, role: 'parent' }).success).toBe(false);
    expect(inviteStaffInputSchema.safeParse({ teamId: TEAM, role: 'head_coach' }).success).toBe(true);
  });

  it('should need children for a parent invited by email, but not for a name-only record', () => {
    expect(inviteParentInputSchema.safeParse({ teamId: TEAM, email: 'pat@example.com' }).success).toBe(false);
    expect(inviteParentInputSchema.safeParse({ teamId: TEAM, email: 'pat@example.com', playerIds: [CHILD] }).success).toBe(true);
    expect(inviteParentInputSchema.safeParse({ teamId: TEAM, firstName: 'Pat' }).success).toBe(true);
  });

  it('should take an optional email for a player invite and a team role for a role change', () => {
    expect(invitePlayerInputSchema.parse({ teamId: TEAM, playerId: CHILD })).toEqual({ teamId: TEAM, playerId: CHILD });
    expect(invitePlayerInputSchema.safeParse({ teamId: TEAM, playerId: CHILD, email: 'nope' }).success).toBe(false);
    expect(updateMemberRoleInputSchema.safeParse({ teamId: TEAM, memberId: MEMBER, role: 'owner' }).success).toBe(false);
  });
});
