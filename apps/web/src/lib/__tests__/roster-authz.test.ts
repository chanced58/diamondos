/**
 * Authorization guards on the roster, member and DM server actions. Each of
 * these writes with the service-role key, so these checks are the only thing
 * standing between a signed-in user and another team's data.
 */
import { addPlayerAction } from '../../app/(app)/teams/[teamId]/roster/new/actions';
import { updatePlayerAction } from '../../app/(app)/teams/[teamId]/roster/[playerId]/actions';
import {
  removeMemberAction,
  removeInvitationAction,
  updateStaffMemberAction,
  updateParentMemberAction,
  updateInvitationAction,
} from '../../app/(app)/teams/[teamId]/roster/member-actions';
import { updateMemberRoleAction } from '../../app/(app)/teams/[teamId]/admin/users/actions';
import { startDmAction } from '../../app/(app)/messages/dm/new/actions';

type Call = { table: string; op: string; filters: [string, string, unknown][]; payload?: unknown };

const calls: Call[] = [];
// Result returned for a given "table.op" (op = select | insert | update | delete).
let results: Record<string, { data: unknown; error: unknown }> = {};

function query(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  calls.push(call);
  const resolve = () => Promise.resolve(results[`${table}.${call.op}`] ?? { data: null, error: null });
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
    update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
    delete: () => { call.op = 'delete'; return builder; },
    upsert: (payload: unknown) => { call.op = 'upsert'; call.payload = payload; return builder; },
    eq: (col: string, val: unknown) => { call.filters.push(['eq', col, val]); return builder; },
    in: (col: string, val: unknown) => { call.filters.push(['in', col, val]); return builder; },
    limit: () => builder,
    single: resolve,
    maybeSingle: resolve,
    then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected),
  };
  return builder;
}

const mockGetUser = jest.fn();
const mockDb = { from: jest.fn(query), auth: { admin: { inviteUserByEmail: jest.fn() } } };
const mockCanManageRoster = jest.fn();

jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDb }));
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser: mockGetUser } }),
}));
jest.mock('@/lib/roster-access', () => ({
  canManageRoster: (...args: unknown[]) => mockCanManageRoster(...args),
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));
const mockStartDirectMessage = jest.fn();
jest.mock('@/lib/services/messaging/team-messaging', () => ({
  startDirectMessage: (...args: unknown[]) => mockStartDirectMessage(...args),
}));
jest.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error(url), { digest: 'NEXT_REDIRECT' }); },
}));

const TEAM = 'team-a';

function writesTo(table: string): Call[] {
  return calls.filter((c) => c.table === table && c.op !== 'select');
}

function hasFilter(call: Call, col: string, val: unknown): boolean {
  return call.filters.some(([, c, v]) => c === col && v === val);
}

function playerForm(extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries({ teamId: TEAM, firstName: 'Sam', lastName: 'Lee', ...extra })) {
    form.set(k, v);
  }
  return form;
}

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  results = {};
  mockGetUser.mockResolvedValue({ data: { user: { id: 'caller' } } });
});

afterEach(() => {
  // Some tests override the builder; restore it even when an expectation fails.
  mockDb.from.mockImplementation(query);
});

describe('roster player actions', () => {
  it('should refuse to add a player for someone who cannot manage the roster', async () => {
    mockCanManageRoster.mockResolvedValue(false);
    expect(await addPlayerAction(null, playerForm())).toContain('permission');
    expect(mockCanManageRoster).toHaveBeenCalledWith(TEAM, 'caller');
    expect(writesTo('players')).toHaveLength(0);
  });

  it('should add the player when the caller can manage the roster', async () => {
    mockCanManageRoster.mockResolvedValue(true);
    results['players.insert'] = { data: { id: 'p1' }, error: null };
    await expect(addPlayerAction(null, playerForm())).rejects.toThrow(`/teams/${TEAM}/roster`);
    expect(writesTo('players')).toHaveLength(1);
  });

  it('should refuse to edit a player for someone who cannot manage the roster', async () => {
    mockCanManageRoster.mockResolvedValue(false);
    expect(await updatePlayerAction(null, playerForm({ playerId: 'p1' }))).toContain('permission');
    expect(writesTo('players')).toHaveLength(0);
  });
});

describe('roster member actions', () => {
  beforeEach(() => {
    // getCallerRole: not a platform admin, active head coach of TEAM.
    results['user_profiles.select'] = { data: { is_platform_admin: false }, error: null };
    results['team_members.select'] = { data: { role: 'head_coach', id: 'm1' }, error: null };
  });

  it('should scope member removal to the caller\'s team', async () => {
    await removeMemberAction(TEAM, 'm-other');
    const [del] = writesTo('team_members');
    expect(del.op).toBe('delete');
    expect(hasFilter(del, 'team_id', TEAM)).toBe(true);
  });

  it('should scope invitation removal and edits to the caller\'s team', async () => {
    await removeInvitationAction(TEAM, 'inv-1');
    await updateInvitationAction(TEAM, 'inv-1', { firstName: 'A', lastName: 'B', phone: '' });
    const writes = writesTo('team_invitations');
    expect(writes).toHaveLength(2);
    for (const write of writes) expect(hasFilter(write, 'team_id', TEAM)).toBe(true);
  });

  it('should reject a role outside the team_role enum', async () => {
    const staff = { firstName: 'A', lastName: 'B', email: '', phone: '', role: 'owner', jerseyNumber: null };
    expect(await updateStaffMemberAction(TEAM, 'm1', 'u1', staff)).toBe('Invalid role.');
    expect(await updateInvitationAction(TEAM, 'inv-1', { firstName: 'A', lastName: 'B', phone: '', role: 'owner' }))
      .toBe('Invalid role.');
    expect(writesTo('team_members')).toHaveLength(0);
    expect(writesTo('team_invitations')).toHaveLength(0);
  });

  it('should not edit the profile of a user who is not on the caller\'s team', async () => {
    results['team_members.update'] = { data: [], error: null };
    const staff = { firstName: 'A', lastName: 'B', email: 'x@y.z', phone: '', role: 'assistant_coach', jerseyNumber: null };
    expect(await updateStaffMemberAction(TEAM, 'm-other', 'u-other', staff)).toBe('Member not found on this team.');
    const [update] = writesTo('team_members');
    expect(hasFilter(update, 'team_id', TEAM)).toBe(true);
    expect(hasFilter(update, 'user_id', 'u-other')).toBe(true);
    expect(hasFilter(update, 'is_active', true)).toBe(true);
    expect(writesTo('user_profiles')).toHaveLength(0);
  });

  it('should update a staff member\'s profile once membership is proven', async () => {
    results['team_members.update'] = { data: [{ id: 'm1' }], error: null };
    const staff = { firstName: 'A', lastName: 'B', email: '', phone: '', role: 'scorekeeper', jerseyNumber: null };
    expect(await updateStaffMemberAction(TEAM, 'm1', 'u1', staff)).toBeNull();
    expect(writesTo('user_profiles')).toHaveLength(1);
  });

  it('should not edit a parent profile unless the parent is on the caller\'s team', async () => {
    // getCallerRole and isMemberOfTeam both read team_members; fail only the membership proof.
    let reads = 0;
    mockDb.from.mockImplementation((table: string) => {
      const builder = query(table) as Record<string, unknown>;
      if (table === 'team_members') {
        builder.maybeSingle = () => Promise.resolve(
          reads++ === 0 ? { data: { role: 'head_coach' }, error: null } : { data: null, error: null },
        );
      }
      return builder;
    });
    const parent = { firstName: 'A', lastName: 'B', email: '', phone: '' };
    expect(await updateParentMemberAction(TEAM, 'm-other', 'u-other', parent)).toBe('Member not found on this team.');
    expect(writesTo('user_profiles')).toHaveLength(0);
  });
});

describe('team admin role changes', () => {
  it('should reject a role outside the team_role enum', async () => {
    results['user_profiles.select'] = { data: { is_platform_admin: true }, error: null };
    const form = new FormData();
    form.set('teamId', TEAM);
    form.set('memberId', 'm1');
    form.set('role', 'superuser');
    expect(await updateMemberRoleAction(null, form)).toBe('Invalid role.');
    expect(writesTo('team_members')).toHaveLength(0);
  });
});

// The DM guards (both people active on the team, not yourself, the plan has
// DMs) live in `startDirectMessage`, shared with the mobile route — see
// lib/services/messaging/__tests__/team-messaging.test.ts. The action only
// passes the form through and redirects on success.
describe('startDmAction', () => {
  const DM_TEAM = '11111111-1111-4111-8111-111111111111';
  const CALLER = '22222222-2222-4222-8222-222222222222';
  const TARGET = '33333333-3333-4333-8333-333333333333';

  function dmForm(targetUserId = TARGET): FormData {
    const form = new FormData();
    form.set('teamId', DM_TEAM);
    form.set('targetUserId', targetUserId);
    return form;
  }

  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: CALLER } } });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should pass the caller and form to the service, and stay put when it refuses', async () => {
    mockStartDirectMessage.mockResolvedValue({ ok: false, code: 'not_found', error: "That person isn't on this team." });
    // The redirect mock throws, so resolving means no redirect.
    await expect(startDmAction(dmForm())).resolves.toBeUndefined();
    expect(mockStartDirectMessage).toHaveBeenCalledWith(mockDb, CALLER, { teamId: DM_TEAM, targetUserId: TARGET });
  });

  it('should open the DM the service returns', async () => {
    mockStartDirectMessage.mockResolvedValue({ ok: true, data: { channelId: 'ch1' } });
    await expect(startDmAction(dmForm())).rejects.toThrow('/messages/ch1');
  });
});
