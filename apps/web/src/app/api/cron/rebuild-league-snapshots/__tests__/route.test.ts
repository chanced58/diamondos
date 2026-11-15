import { NextRequest } from 'next/server';
import { GET } from '../route';
import { reportError } from '@/lib/errors/report-error';
import { recomputeLeagueSnapshot } from '@/lib/league-snapshot/recompute';
import { listLeagueSeasons } from '@/lib/league-snapshot/season';

jest.mock('@/lib/errors/report-error', () => ({ reportError: jest.fn() }));
jest.mock('@/lib/league-snapshot/recompute', () => ({ recomputeLeagueSnapshot: jest.fn() }));
jest.mock('@/lib/league-snapshot/season', () => ({ listLeagueSeasons: jest.fn() }));

/** A chainable query: `.eq()` returns itself and awaiting it yields the result. */
function query(result: unknown) {
  const q: Record<string, unknown> = {
    eq: () => q,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return q;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () =>
        table === 'leagues'
          ? Promise.resolve({ data: [{ id: 'league-1' }, { id: 'league-2' }], error: null })
          : query({ data: [{ team_id: 't1' }], error: null }),
    }),
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  process.env.CRON_SECRET = 'secret';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('GET /api/cron/rebuild-league-snapshots', () => {
  it('should report a failed league as cron.rebuild and keep sweeping the rest', async () => {
    (listLeagueSeasons as jest.Mock).mockResolvedValue(['Spring 2027']);
    (recomputeLeagueSnapshot as jest.Mock).mockRejectedValueOnce(new Error('bad league'));

    const res = await GET(
      new NextRequest('https://example.com/api/cron/rebuild-league-snapshots', {
        headers: { authorization: 'Bearer secret' },
      }),
    );

    expect(reportError).toHaveBeenCalledWith('cron.rebuild', expect.objectContaining({ message: 'bad league' }), {
      details: { leagueId: 'league-1' },
    });
    expect(await res.json()).toEqual({ ok: true, rebuilt: 1 });
  });
});
