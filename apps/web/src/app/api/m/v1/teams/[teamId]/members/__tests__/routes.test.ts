import { NextResponse } from 'next/server';
import { GET as membersRoute } from '../route';
import { DELETE as removeRoute, PATCH as roleRoute } from '../[memberId]/route';
import { POST as staffRoute } from '../../invitations/staff/route';
import { POST as parentRoute } from '../../invitations/parent/route';
import { POST as playerRoute } from '../../invitations/player/route';
import { DELETE as cancelRoute } from '../../invitations/[invitationId]/route';
import { POST as resendRoute } from '../../invitations/[invitationId]/resend/route';
import { POST as linkRoute } from '../../parent-links/route';
import { DELETE as unlinkRoute } from '../../parent-links/[parentUserId]/[playerId]/route';

const mockRequireApiUser = jest.fn();
const mockServices = {
  loadTeamMembers: jest.fn(),
  updateMemberRole: jest.fn(),
  removeMember: jest.fn(),
  linkParent: jest.fn(),
  unlinkParent: jest.fn(),
  inviteStaff: jest.fn(),
  inviteParent: jest.fn(),
  invitePlayer: jest.fn(),
  resendInvitation: jest.fn(),
  cancelInvitation: jest.fn(),
};
jest.mock('@/lib/api/bearer-auth', () => ({
  ...jest.requireActual('@/lib/api/bearer-auth'),
  requireApiUser: (req: Request) => mockRequireApiUser(req),
}));
jest.mock('@/lib/services/members/team-members', () => ({
  loadTeamMembers: (...args: unknown[]) => mockServices.loadTeamMembers(...args),
  updateMemberRole: (...args: unknown[]) => mockServices.updateMemberRole(...args),
  removeMember: (...args: unknown[]) => mockServices.removeMember(...args),
  linkParent: (...args: unknown[]) => mockServices.linkParent(...args),
  unlinkParent: (...args: unknown[]) => mockServices.unlinkParent(...args),
}));
jest.mock('@/lib/services/members/team-invitations', () => ({
  inviteStaff: (...args: unknown[]) => mockServices.inviteStaff(...args),
  inviteParent: (...args: unknown[]) => mockServices.inviteParent(...args),
  invitePlayer: (...args: unknown[]) => mockServices.invitePlayer(...args),
  resendInvitation: (...args: unknown[]) => mockServices.resendInvitation(...args),
  cancelInvitation: (...args: unknown[]) => mockServices.cancelInvitation(...args),
}));

const DB = { name: 'db' };
const request = (method = 'GET', body?: unknown) =>
  new Request('https://example.com/api/m/v1/teams/t1/members', {
    method,
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const team = { params: { teamId: 't1' } };
const member = { params: { teamId: 't1', memberId: 'm1' } };
const invitation = { params: { teamId: 't1', invitationId: 'i1' } };
const link = { params: { teamId: 't1', parentUserId: 'u2', playerId: 'p1' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireApiUser.mockResolvedValue({ user: { id: 'u1' }, db: DB });
  for (const service of Object.values(mockServices)) service.mockResolvedValue({ ok: true, data: {} });
});

describe('member and invitation routes', () => {
  it('should respond 401 without calling a service', async () => {
    mockRequireApiUser.mockResolvedValue({ response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) });
    const responses = await Promise.all([
      membersRoute(request(), team),
      roleRoute(request('PATCH', {}), member),
      removeRoute(request('DELETE'), member),
      staffRoute(request('POST', {}), team),
      parentRoute(request('POST', {}), team),
      playerRoute(request('POST', {}), team),
      cancelRoute(request('DELETE'), invitation),
      resendRoute(request('POST'), invitation),
      linkRoute(request('POST', {}), team),
      unlinkRoute(request('DELETE'), link),
    ]);
    for (const response of responses) expect(response.status).toBe(401);
    for (const service of Object.values(mockServices)) expect(service).not.toHaveBeenCalled();
  });

  it('should take ids from the path over the body', async () => {
    await membersRoute(request(), team);
    expect(mockServices.loadTeamMembers).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1' });

    await roleRoute(request('PATCH', { role: 'staff', memberId: 'other', teamId: 'other' }), member);
    expect(mockServices.updateMemberRole).toHaveBeenCalledWith(DB, 'u1', { role: 'staff', memberId: 'm1', teamId: 't1' });

    await removeRoute(request('DELETE'), member);
    expect(mockServices.removeMember).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', memberId: 'm1' });

    await cancelRoute(request('DELETE'), invitation);
    expect(mockServices.cancelInvitation).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', invitationId: 'i1' });
    await resendRoute(request('POST'), invitation);
    expect(mockServices.resendInvitation).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', invitationId: 'i1' });

    await linkRoute(request('POST', { parentUserId: 'u2', playerId: 'p1', teamId: 'other' }), team);
    expect(mockServices.linkParent).toHaveBeenCalledWith(DB, 'u1', { parentUserId: 'u2', playerId: 'p1', teamId: 't1' });
    await unlinkRoute(request('DELETE'), link);
    expect(mockServices.unlinkParent).toHaveBeenCalledWith(DB, 'u1', { teamId: 't1', parentUserId: 'u2', playerId: 'p1' });
  });

  it('should answer invitations with 201, and map a refusal', async () => {
    expect((await staffRoute(request('POST', { email: 'a@b.co', role: 'staff' }), team)).status).toBe(201);
    expect(mockServices.inviteStaff).toHaveBeenCalledWith(DB, 'u1', { email: 'a@b.co', role: 'staff', teamId: 't1' });
    expect((await parentRoute(request('POST', { playerIds: ['p1'] }), team)).status).toBe(201);
    expect((await playerRoute(request('POST', { playerId: 'p1' }), team)).status).toBe(201);

    mockServices.invitePlayer.mockResolvedValue({ ok: false, code: 'conflict', error: 'This player already has an account.' });
    const response = await playerRoute(request('POST', { playerId: 'p1' }), team);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'This player already has an account.', code: 'conflict' });
  });
});
