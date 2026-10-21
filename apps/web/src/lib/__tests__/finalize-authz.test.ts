import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthorizedCoach, getAuthorizedFinalizer } from '../games/finalize';

jest.mock('@/lib/league-snapshot/recompute', () => ({ recomputeLeagueSnapshot: jest.fn() }));
jest.mock('@/lib/dual-scorekeeper/reconcile', () => ({ runReconciliationForGame: jest.fn() }));

const GAME = { team_id: 'team-1', status: 'in_progress' };

/**
 * Query-builder stand-in that honours the `is_active` filter, so an inactive
 * membership is invisible exactly as it is to the real query.
 */
function fakeDb(membership: { role: string; is_active: boolean } | null, isPlatformAdmin = false) {
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: { is_platform_admin: isPlatformAdmin }, error: null }),
        single: () => {
          if (table === 'games') return Promise.resolve({ data: GAME, error: null });
          const visible = membership && (filters.is_active === undefined || filters.is_active === membership.is_active);
          return Promise.resolve({ data: visible ? { role: membership.role } : null, error: null });
        },
      };
      return builder;
    },
  };
  return db as unknown as SupabaseClient;
}

describe('getAuthorizedFinalizer', () => {
  it('should authorize an active scorekeeper', async () => {
    const result = await getAuthorizedFinalizer(fakeDb({ role: 'scorekeeper', is_active: true }), 'user-1', 'game-1');

    expect(result).toEqual({ game: GAME });
  });

  it('should reject an inactive scorekeeper', async () => {
    const result = await getAuthorizedFinalizer(fakeDb({ role: 'scorekeeper', is_active: false }), 'user-1', 'game-1');

    expect(result).toMatchObject({ code: 'forbidden' });
  });

  it.each(['head_coach', 'assistant_coach', 'athletic_director'])('should authorize an active %s', async (role) => {
    expect(await getAuthorizedFinalizer(fakeDb({ role, is_active: true }), 'user-1', 'game-1')).toEqual({ game: GAME });
  });

  it.each(['player', 'parent', 'staff'])('should reject a %s', async (role) => {
    expect(await getAuthorizedFinalizer(fakeDb({ role, is_active: true }), 'user-1', 'game-1'))
      .toMatchObject({ code: 'forbidden', error: 'Only coaches and scorekeepers can finalize a game.' });
  });
});

describe('getAuthorizedCoach', () => {
  it('should still reject a scorekeeper for the other web game actions', async () => {
    expect(await getAuthorizedCoach(fakeDb({ role: 'scorekeeper', is_active: true }), 'user-1', 'game-1'))
      .toMatchObject({ code: 'forbidden', error: 'Only coaches can perform this action.' });
  });
});
