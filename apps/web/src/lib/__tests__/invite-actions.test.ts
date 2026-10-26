/**
 * The staff form's email lookup is for those who can invite staff to the
 * team. The invite rules themselves live in lib/services/members (see its
 * tests); the actions pass the form through and report the outcome.
 */
import { inviteStaffAction, lookupUserByEmailAction } from '../../app/(app)/teams/[teamId]/roster/staff/new/actions';
import { inviteParentAction } from '../../app/(app)/teams/[teamId]/roster/parents/new/actions';
import { fakeDb, type FakeCall } from '../services/__tests__/fake-db';

const TEAM = '11111111-1111-4111-8111-111111111111';
const CALLER = 'caller';
const TARGET = 'target';

let mockDb: ReturnType<typeof fakeDb>;
const mockGetUser = jest.fn();
const mockInviteStaff = jest.fn();
const mockInviteParent = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDb.db }));
jest.mock('@/lib/supabase/server', () => ({ createServerClient: () => ({ auth: { getUser: mockGetUser } }) }));
jest.mock('@/lib/services/members/team-invitations', () => ({
  inviteStaff: (...args: unknown[]) => mockInviteStaff(...args),
  inviteParent: (...args: unknown[]) => mockInviteParent(...args),
}));

/** The caller's role on the team. */
function setup(callerRole: string | null) {
  mockDb = fakeDb({
    'user_profiles.select': (call: FakeCall) =>
      call.filters.email ? { data: { id: TARGET, first_name: 'Pat', last_name: 'Doe' } } : { data: { is_platform_admin: false } },
    'team_members.select': { data: callerRole ? { id: 'own', role: callerRole } : null },
  });
}

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: CALLER } } });
  setup('head_coach');
});

describe('lookupUserByEmailAction', () => {
  it('should tell nothing to someone who can’t invite staff to the team', async () => {
    setup('parent');
    expect(await lookupUserByEmailAction(TEAM, 'pat@example.com')).toBeNull();
    expect(mockDb.calls.some((c) => c.table === 'user_profiles' && c.filters.email)).toBe(false);
  });

  it('should find an existing account for a coach', async () => {
    setup('assistant_coach');
    expect(await lookupUserByEmailAction(TEAM, ' Pat@Example.com ')).toEqual({ id: TARGET, firstName: 'Pat', lastName: 'Doe' });
  });
});

describe('invite actions', () => {
  it('should pass a staff invite through and report its outcome', async () => {
    mockInviteStaff.mockResolvedValue({ ok: true, data: { outcome: 'invited' } });
    const result = await inviteStaffAction(null, form({ teamId: TEAM, email: 'pat@example.com', role: 'staff', firstName: 'Pat', jerseyNumber: '12' }));
    expect(result).toBe('invited');
    expect(mockInviteStaff).toHaveBeenCalledWith(mockDb.db, CALLER, expect.objectContaining({ teamId: TEAM, email: 'pat@example.com', role: 'staff', firstName: 'Pat', jerseyNumber: 12 }));
  });

  it('should pass a parent invite through with the chosen children and report a refusal', async () => {
    mockInviteParent.mockResolvedValue({ ok: false, code: 'conflict', error: 'They are already on this team with another role.' });
    const result = await inviteParentAction(null, form({ teamId: TEAM, email: 'pat@example.com', playerIds: ['p1', 'p2'] }));
    expect(result).toBe('They are already on this team with another role.');
    expect(mockInviteParent).toHaveBeenCalledWith(mockDb.db, CALLER, expect.objectContaining({ teamId: TEAM, playerIds: ['p1', 'p2'] }));
  });

  it('should ask a signed-out user to sign in', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await inviteStaffAction(null, form({ teamId: TEAM, role: 'staff' }))).toContain('log in');
    expect(mockInviteStaff).not.toHaveBeenCalled();
  });
});
