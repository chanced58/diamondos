/**
 * The staff and parent invite actions write with the service role: the email
 * lookup is for those who can invite, and an invite never changes the role of
 * someone already on the team.
 */
import { inviteStaffAction, lookupUserByEmailAction } from '../../app/(app)/teams/[teamId]/roster/staff/new/actions';
import { inviteParentAction } from '../../app/(app)/teams/[teamId]/roster/parents/new/actions';
import { fakeDb, type FakeCall } from '../services/__tests__/fake-db';

const TEAM = '11111111-1111-4111-8111-111111111111';
const CALLER = 'caller';
const TARGET = 'target';

let mockDb: ReturnType<typeof fakeDb>;
const mockGetUser = jest.fn();
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockDb.db }));
jest.mock('@/lib/supabase/server', () => ({ createServerClient: () => ({ auth: { getUser: mockGetUser } }) }));
jest.mock('@/lib/team-channels', () => ({ addToTeamChannels: jest.fn() }));

/** The caller's role on the team, and the target's current membership (if any). */
function setup(callerRole: string | null, targetMembership: { role: string; is_active: boolean } | null = null) {
  mockDb = fakeDb({
    'user_profiles.select': (call: FakeCall) =>
      call.filters.email ? { data: { id: TARGET, first_name: 'Pat', last_name: 'Doe' } } : { data: { is_platform_admin: false } },
    'team_members.select': (call: FakeCall) =>
      call.filters.user_id === CALLER ? { data: callerRole ? { role: callerRole } : null } : { data: targetMembership },
  });
  return mockDb;
}

const form = (fields: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
};
const memberWrites = () => mockDb.calls.filter((c) => c.table === 'team_members' && c.op !== 'select');

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: CALLER } } });
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

describe('inviteStaffAction', () => {
  it('should not change the role of someone already on the team', async () => {
    setup('assistant_coach', { role: 'head_coach', is_active: true });
    const result = await inviteStaffAction(null, form({ teamId: TEAM, email: 'pat@example.com', role: 'staff' }));
    expect(result).toContain('already on this team');
    expect(memberWrites()).toHaveLength(0);
  });

  it('should add an existing account that isn’t on the team', async () => {
    setup('head_coach', null);
    expect(await inviteStaffAction(null, form({ teamId: TEAM, email: 'pat@example.com', role: 'scorekeeper' }))).toBe('added');
    expect(memberWrites()[0].payload).toMatchObject({ team_id: TEAM, user_id: TARGET, role: 'scorekeeper', is_active: true });
  });
});

describe('inviteParentAction', () => {
  it('should not turn a coach on the team into a parent', async () => {
    mockDb = fakeDb({
      'team_members.select': (call: FakeCall) =>
        call.filters.user_id === CALLER ? { data: { role: 'assistant_coach' } } : { data: { role: 'head_coach', is_active: true } },
      'players.select': { data: [{ id: 'p1' }] },
      'user_profiles.select': { data: { id: TARGET } },
    });
    const result = await inviteParentAction(null, form({ teamId: TEAM, email: 'pat@example.com', playerIds: ['p1'] }));
    expect(result).toContain('already on this team');
    expect(memberWrites()).toHaveLength(0);
  });
});
