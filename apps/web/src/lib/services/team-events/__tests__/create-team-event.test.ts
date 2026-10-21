import type { SupabaseClient } from '@supabase/supabase-js';
import { createTeamEvent } from '../create-team-event';

const mockPostEventAlert = jest.fn();
jest.mock('@/app/(app)/messages/notify', () => ({
  postEventAlert: (...args: unknown[]) => mockPostEventAlert(...args),
}));

const TEAM_ID = '11111111-1111-4111-8111-111111111111';
const VALID_INPUT = {
  teamId: TEAM_ID,
  title: 'Team meeting',
  eventType: 'meeting',
  startsAt: '2026-10-21T18:00:00.000Z',
  location: 'Gym',
};

interface FakeOptions {
  membership?: { role: string } | null;
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
}

function fakeDb({ membership = { role: 'head_coach' }, insertResult }: FakeOptions = {}) {
  const filters: Array<[string, string, unknown]> = [];
  const inserts: unknown[] = [];
  const db = {
    from(table: string) {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([table, column, value]);
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: membership, error: null }),
        insert: (row: unknown) => {
          inserts.push(row);
          return builder;
        },
        single: () => Promise.resolve(insertResult ?? { data: { id: 'event-1' }, error: null }),
      };
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, filters, inserts };
}

beforeEach(() => jest.clearAllMocks());

describe('createTeamEvent', () => {
  it('should create the event for an active coach and return its id', async () => {
    const { db, inserts, filters } = fakeDb();

    const result = await createTeamEvent(db, 'coach-1', VALID_INPUT);

    expect(result).toEqual({ ok: true, data: { eventId: 'event-1' } });
    expect(inserts).toEqual([{
      team_id: TEAM_ID,
      title: 'Team meeting',
      event_type: 'meeting',
      starts_at: '2026-10-21T18:00:00.000Z',
      ends_at: null,
      location: 'Gym',
      address: null,
      latitude: null,
      longitude: null,
      place_id: null,
      description: null,
      created_by: 'coach-1',
    }]);
    // A deactivated membership must not authorize.
    expect(filters).toContainEqual(['team_members', 'is_active', true]);
    expect(mockPostEventAlert).not.toHaveBeenCalled();
  });

  it('should post to the announcement channel when notifyTeam is set', async () => {
    const { db } = fakeDb();

    await createTeamEvent(db, 'coach-1', { ...VALID_INPUT, notifyTeam: true });

    expect(mockPostEventAlert).toHaveBeenCalledWith(
      db, TEAM_ID, 'coach-1', expect.stringContaining('📢 Team Meeting: Team meeting'),
    );
  });

  it.each(['player', 'parent', 'scorekeeper'])('should forbid a %s', async (role) => {
    const { db, inserts } = fakeDb({ membership: { role } });

    const result = await createTeamEvent(db, 'user-1', VALID_INPUT);

    expect(result).toEqual({ ok: false, code: 'forbidden', error: 'Only coaches can create team events.' });
    expect(inserts).toEqual([]);
  });

  it('should forbid a user with no active membership on the team', async () => {
    const { db } = fakeDb({ membership: null });

    expect(await createTeamEvent(db, 'stranger', VALID_INPUT)).toMatchObject({ ok: false, code: 'forbidden' });
  });

  it('should reject invalid input before touching the database', async () => {
    const { db, filters } = fakeDb();

    const result = await createTeamEvent(db, 'coach-1', { ...VALID_INPUT, title: '' });

    expect(result).toEqual({ ok: false, code: 'invalid', error: 'Event title is required.' });
    expect(filters).toEqual([]);
  });

  it('should report a failed insert', async () => {
    const { db } = fakeDb({ insertResult: { data: null, error: { message: 'constraint' } } });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(await createTeamEvent(db, 'coach-1', VALID_INPUT)).toEqual({
      ok: false, code: 'failed', error: 'Failed to create event: constraint',
    });
    consoleError.mockRestore();
  });
});
