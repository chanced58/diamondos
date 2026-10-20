import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureTournamentOpponentTeam } from '../games/tournament-opponent-team';

function mockDb(options: {
  existing?: { id: string; name: string }[];
  lookupError?: { message: string };
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
}) {
  const insert = jest.fn(() => ({
    select: () => ({
      single: () => Promise.resolve(options.insertResult ?? { data: { id: 'new-opp' }, error: null }),
    }),
  }));
  const eq = jest.fn(() =>
    Promise.resolve({ data: options.lookupError ? null : options.existing ?? [], error: options.lookupError ?? null }),
  );
  const db = { from: jest.fn(() => ({ select: () => ({ eq }), insert })) };
  return { db: db as unknown as SupabaseClient, insert, eq };
}

const params = { teamId: 'team-1', opponentName: '  River Hawks ', userId: 'coach-1' };

describe('ensureTournamentOpponentTeam', () => {
  it('should create an opponent team when the team has none with that name', async () => {
    const { db, insert, eq } = mockDb({ existing: [{ id: 'other', name: 'Bears' }] });

    await expect(ensureTournamentOpponentTeam(db, params)).resolves.toEqual({ opponentTeamId: 'new-opp' });
    expect(eq).toHaveBeenCalledWith('team_id', 'team-1');
    expect(insert).toHaveBeenCalledWith({ team_id: 'team-1', name: 'River Hawks', created_by: 'coach-1' });
  });

  it('should reuse an existing opponent team whose name matches case-insensitively', async () => {
    const { db, insert } = mockDb({ existing: [{ id: 'hawks', name: 'river hawks' }] });

    await expect(ensureTournamentOpponentTeam(db, params)).resolves.toEqual({ opponentTeamId: 'hawks' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('should return an error when the lookup fails', async () => {
    const { db, insert } = mockDb({ lookupError: { message: 'boom' } });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(ensureTournamentOpponentTeam(db, params)).resolves.toEqual({
      error: 'Failed to look up opponent team: boom',
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('should return an error when the insert fails', async () => {
    const { db } = mockDb({ insertResult: { data: null, error: { message: 'denied' } } });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(ensureTournamentOpponentTeam(db, params)).resolves.toEqual({
      error: 'Failed to create opponent team: denied',
    });
  });
});
