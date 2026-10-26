import { emptyParentInvite, emptyStaffInvite, inviteOutcomeMessage, toParentInvite, toStaffInvite } from '../invite-form-model';
import { cancelInvitation, displayName, invitePlayer, unlinkParent, updateMemberRole } from '../members-api';
import type { ApiClient } from '../../../lib/api-client';

const CHILD = '22222222-2222-4222-8222-222222222222';

describe('invite form model', () => {
  it('should turn a staff form into the contract, blanks as null', () => {
    expect(toStaffInvite({ ...emptyStaffInvite, role: 'scorekeeper', email: ' Al@Example.com ', firstName: 'Al', jerseyNumber: '' })).toEqual({
      invite: { email: 'al@example.com', role: 'scorekeeper', firstName: 'Al', lastName: null, phone: null, jerseyNumber: null },
    });
  });

  it('should explain a staff form’s first problem', () => {
    expect(toStaffInvite(emptyStaffInvite)).toEqual({ error: 'Pick a role.' });
    expect(toStaffInvite({ ...emptyStaffInvite, role: 'staff', jerseyNumber: '1a' })).toEqual({ error: 'Jersey numbers run 0–99.' });
    expect(toStaffInvite({ ...emptyStaffInvite, role: 'staff', email: 'nope' })).toEqual({ error: 'Please enter a valid email address.' });
  });

  it('should need children for a parent invited by email', () => {
    expect(toParentInvite({ ...emptyParentInvite, email: 'pat@example.com' })).toEqual({ error: 'Please select at least one player to link this parent to.' });
    expect(toParentInvite({ ...emptyParentInvite, email: 'pat@example.com', playerIds: [CHILD] })).toEqual({
      invite: { email: 'pat@example.com', firstName: null, lastName: null, phone: null, playerIds: [CHILD] },
    });
  });

  it('should tell the coach what happened', () => {
    expect(inviteOutcomeMessage({ outcome: 'invited' }, 'pat@example.com')).toContain('emailed an invite to pat@example.com');
    expect(inviteOutcomeMessage({ outcome: 'added' }, 'pat@example.com')).toContain('already had an account');
    expect(inviteOutcomeMessage({ outcome: 'added' }, null)).toContain('team’s list');
  });

  it('should name a person by their name, else their email', () => {
    expect(displayName({ firstName: 'Pat', lastName: null })).toBe('Pat');
    expect(displayName({ firstName: null, lastName: null, email: 'pat@example.com' })).toBe('pat@example.com');
    expect(displayName({ firstName: null, lastName: null })).toBe('Unnamed');
  });
});

describe('members api', () => {
  it('should call the team member routes', async () => {
    const client = {
      post: jest.fn().mockResolvedValue({}),
      patch: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    } as unknown as ApiClient;

    await invitePlayer('t1', 'p1', null, client);
    expect(client.post).toHaveBeenCalledWith('/teams/t1/invitations/player', { playerId: 'p1' }, expect.anything());
    await invitePlayer('t1', 'p1', 'a@b.co', client);
    expect(client.post).toHaveBeenLastCalledWith('/teams/t1/invitations/player', { playerId: 'p1', email: 'a@b.co' }, expect.anything());
    await updateMemberRole('t1', 'm1', 'staff', client);
    expect(client.patch).toHaveBeenCalledWith('/teams/t1/members/m1', { role: 'staff' }, expect.anything());
    await cancelInvitation('t1', 'i1', client);
    expect(client.delete).toHaveBeenCalledWith('/teams/t1/invitations/i1', expect.anything());
    await unlinkParent('t1', 'u2', 'p1', client);
    expect(client.delete).toHaveBeenLastCalledWith('/teams/t1/parent-links/u2/p1', expect.anything());
  });
});
