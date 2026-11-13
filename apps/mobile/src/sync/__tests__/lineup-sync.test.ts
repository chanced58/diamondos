jest.mock('../../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));

import { gamesWithWithheldPlayers, lineupRowsToPush, stampAfterServer } from '../lineup-sync';

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

describe('stampAfterServer', () => {
  it('should stamp withheld rows just after the server\'s write when the phone clock is behind', () => {
    expect(stampAfterServer(10_000, 5_000)).toBe(10_001);
  });

  it('should use the phone clock when it is already past the server\'s write', () => {
    expect(stampAfterServer(10_000, 12_000)).toBe(12_000);
  });

  it('should use the phone clock when the server returned no lineup time', () => {
    expect(stampAfterServer(null, 7_000)).toBe(7_000);
    expect(stampAfterServer(Number.NaN, 7_000)).toBe(7_000);
  });
});

describe('gamesWithWithheldPlayers', () => {
  const rows = [
    { gameRemoteId: 'tour-1', playerRemoteId: 'guest-1' },
    { gameRemoteId: 'tour-2', playerRemoteId: 'p-1' },
    { gameRemoteId: 'league-1', playerRemoteId: 'guest-1' },
  ];

  it('should hold a tournament game whose lineup has a guest still waiting', () => {
    expect(gamesWithWithheldPlayers(rows, new Set(['tour-1', 'tour-2']), new Set(['guest-1'])))
      .toEqual(new Set(['tour-1']));
  });

  it('should hold nothing when no guest is waiting', () => {
    expect(gamesWithWithheldPlayers(rows, new Set(['tour-1']), new Set())).toEqual(new Set());
  });
});
