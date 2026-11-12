jest.mock('../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

import { lineupRowsToPush } from '../lineup-sync';

describe('lineupRowsToPush', () => {
  const rows = [
    { id: 'l-1', playerRemoteId: 'p-1' },
    { id: 'l-2', playerRemoteId: 'guest-1' },
    { id: 'l-3', playerRemoteId: 'p-3' },
  ];

  it('should send every row when no guest is waiting', () => {
    expect(lineupRowsToPush(rows, new Set())).toEqual({ pushed: rows, withheld: [] });
  });

  it('should hold back the rows of a guest the server does not have yet and send the rest', () => {
    const { pushed, withheld } = lineupRowsToPush(rows, new Set(['guest-1']));
    expect(pushed.map((r) => r.id)).toEqual(['l-1', 'l-3']);
    expect(withheld.map((r) => r.id)).toEqual(['l-2']);
  });
});
