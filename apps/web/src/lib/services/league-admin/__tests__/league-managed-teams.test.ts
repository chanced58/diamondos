import type { SupabaseClient } from '@supabase/supabase-js';
import { createLeagueManagedTeam, setLeagueSchedulesGames } from '../league-managed-teams';

const LEAGUE_ID = '11111111-1111-4111-8111-111111111111';
const DIVISION_ID = '22222222-2222-4222-8222-222222222222';

interface FakeOptions {
  role?: 'league_admin' | 'league_manager';
  leagueLevel?: string | null;
  memberError?: { message: string; code?: string } | null;
}

function fakeDb({ role = 'league_admin', leagueLevel = 'college', memberError = null }: FakeOptions = {}) {
  const inserts: Array<[string, unknown]> = [];
  const updates: Array<[string, unknown]> = [];
  const deletes: Array<[string, string, unknown]> = [];
  const db = {
    from(table: string) {
      let mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (row: unknown) => { mode = 'insert'; inserts.push([table, row]); return builder; },
        update: (row: unknown) => { mode = 'update'; updates.push([table, row]); return builder; },
        delete: () => { mode = 'delete'; return builder; },
        eq: (column: string, value: unknown) => {
          if (mode === 'delete') deletes.push([table, column, value]);
          return builder;
        },
        maybeSingle: () => {
          if (table === 'league_staff') {
            return Promise.resolve({ data: { role, leagues: { id: LEAGUE_ID, name: 'Adult League' } }, error: null });
          }
          return Promise.resolve({ data: { level: leagueLevel }, error: null });
        },
        single: () => Promise.resolve({ data: { id: 'team-1' }, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          const error = table === 'league_members' && mode === 'insert' ? memberError : null;
          return Promise.resolve({ data: null, error }).then(resolve);
        },
      };
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, inserts, updates, deletes };
}

describe('createLeagueManagedTeam', () => {
  it('should create a team and its league membership without any team members', async () => {
    const { db, inserts } = fakeDb();

    const result = await createLeagueManagedTeam(db, 'admin-1', { leagueId: LEAGUE_ID, name: 'Sluggers', divisionId: DIVISION_ID });

    expect(result).toEqual({ ok: true, data: { teamId: 'team-1' } });
    expect(inserts).toEqual([
      ['teams', { name: 'Sluggers', created_by: 'admin-1', level: 'college' }],
      ['league_members', { league_id: LEAGUE_ID, team_id: 'team-1', division_id: DIVISION_ID, is_active: true }],
    ]);
    expect(inserts.some(([table]) => table === 'team_members')).toBe(false);
  });

  it('should default the team level to high school when the league has none', async () => {
    const { db, inserts } = fakeDb({ leagueLevel: null });

    await createLeagueManagedTeam(db, 'admin-1', { leagueId: LEAGUE_ID, name: 'Sluggers' });

    expect(inserts[0]).toEqual(['teams', { name: 'Sluggers', created_by: 'admin-1', level: 'high_school' }]);
  });

  it('should refuse a league manager', async () => {
    const { db, inserts } = fakeDb({ role: 'league_manager' });

    const result = await createLeagueManagedTeam(db, 'manager-1', { leagueId: LEAGUE_ID, name: 'Sluggers' });

    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(inserts).toEqual([]);
  });

  it('should remove the team when the membership insert fails', async () => {
    const { db, deletes } = fakeDb({ memberError: { message: 'boom' } });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await createLeagueManagedTeam(db, 'admin-1', { leagueId: LEAGUE_ID, name: 'Sluggers' });

    expect(result).toMatchObject({ ok: false, code: 'failed' });
    expect(deletes).toEqual([['teams', 'id', 'team-1']]);
  });

  it('should reject an empty team name', async () => {
    const { db } = fakeDb();

    const result = await createLeagueManagedTeam(db, 'admin-1', { leagueId: LEAGUE_ID, name: '  ' });

    expect(result).toMatchObject({ ok: false, code: 'invalid' });
  });
});

describe('setLeagueSchedulesGames', () => {
  it('should turn the setting on for a league admin', async () => {
    const { db, updates } = fakeDb();

    const result = await setLeagueSchedulesGames(db, 'admin-1', { leagueId: LEAGUE_ID, schedulesGames: true });

    expect(result).toEqual({ ok: true, data: { schedulesGames: true } });
    expect(updates).toEqual([['leagues', { schedules_games: true }]]);
  });

  it('should refuse a league manager', async () => {
    const { db, updates } = fakeDb({ role: 'league_manager' });

    const result = await setLeagueSchedulesGames(db, 'manager-1', { leagueId: LEAGUE_ID, schedulesGames: true });

    expect(result).toMatchObject({ ok: false, code: 'forbidden' });
    expect(updates).toEqual([]);
  });
});
