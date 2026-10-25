import { NextRequest } from 'next/server';
import { POST } from '../../app/api/admin/invite-league-staff/route';

const mockUpsert = jest.fn();
const mockInsert = jest.fn();
const mockClient = {
  auth: {
    getUser: jest.fn(),
    admin: { inviteUserByEmail: jest.fn() },
  },
  from: jest.fn(),
};

jest.mock('@/lib/supabase/server', () => ({ createServerClient: () => mockClient }));
jest.mock('@supabase/supabase-js', () => ({ createClient: () => mockClient }));

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
  mockClient.auth.admin.inviteUserByEmail.mockResolvedValue({
    data: { user: { id: 'invited-staff' } }, error: null,
  });
  mockUpsert.mockImplementation((profile: { first_name: string | null; last_name: string | null }) =>
    Promise.resolve({ error: profile.first_name === null || profile.last_name === null
      ? { message: 'Name columns cannot be null' } : null }),
  );
  mockInsert.mockResolvedValue({ error: null });
  mockClient.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      single: () => Promise.resolve({ data: { is_platform_admin: true }, error: null }),
      maybeSingle: () => Promise.resolve({ data: table === 'leagues' ? { id: 'league' } : null, error: null }),
      limit: () => Promise.resolve({ data: [], error: null }),
      upsert: mockUpsert,
      insert: mockInsert,
    };
    return query;
  });
});

it('invites league staff without optional names using non-null profile defaults', async () => {
  const request = new NextRequest('https://example.com/api/admin/invite-league-staff', {
    method: 'POST',
    body: JSON.stringify({ leagueId: 'league', email: 'staff@example.com', role: 'league_admin' }),
  });

  const response = await POST(request);

  expect(response.status).toBe(200);
  expect(mockUpsert).toHaveBeenCalledWith({
    id: 'invited-staff', email: 'staff@example.com', first_name: '', last_name: '',
  });
  expect(mockInsert).toHaveBeenCalledWith({
    league_id: 'league', user_id: 'invited-staff', role: 'league_admin',
  });
});

it('leaves league channel membership to the database trigger', async () => {
  const request = new NextRequest('https://example.com/api/admin/invite-league-staff', {
    method: 'POST',
    body: JSON.stringify({ leagueId: 'league', email: 'staff@example.com', role: 'league_manager' }),
  });

  const response = await POST(request);

  expect(response.status).toBe(200);
  expect(mockClient.from).not.toHaveBeenCalledWith('league_channel_members');
});
