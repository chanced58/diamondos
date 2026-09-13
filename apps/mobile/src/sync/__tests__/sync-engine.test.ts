// sync-engine.ts also touches WatermelonDB (../db) and the Supabase client
// (../lib/supabase) at module scope; stub both so importing it in a plain
// Jest/node environment doesn't reach for native SQLite or a real client.
jest.mock('../../db', () => ({
  database: {},
}));
jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

import { isFinalizeConfigured, getFinalizeFailureCount } from '../sync-engine';

describe('isFinalizeConfigured', () => {
  it('is true when given a non-empty API base URL', () => {
    expect(isFinalizeConfigured('http://localhost:3000')).toBe(true);
  });

  it('is false when given an empty string', () => {
    expect(isFinalizeConfigured('')).toBe(false);
  });

  it('is false when given undefined', () => {
    expect(isFinalizeConfigured(undefined)).toBe(false);
  });

});

describe('getFinalizeFailureCount', () => {
  it('is 0 for a game with no recorded finalize failures', () => {
    // reconcileGameLifecycle (which increments this) is not exported and
    // needs a full WatermelonDB/Supabase/fetch mock to exercise end to end —
    // out of proportion here (see report). This pins the getter's contract
    // for a game it has never seen, which is what score.tsx relies on to
    // render the "pending" (not "persistently-failing") state by default.
    expect(getFinalizeFailureCount('game-never-attempted')).toBe(0);
  });
});
