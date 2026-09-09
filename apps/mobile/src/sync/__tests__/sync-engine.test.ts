// sync-engine.ts also touches WatermelonDB (../db) and the Supabase client
// (../lib/supabase) at module scope; stub both so importing it in a plain
// Jest/node environment doesn't reach for native SQLite or a real client.
jest.mock('../../db', () => ({
  database: {},
}));
jest.mock('../../lib/supabase', () => ({
  getSupabaseClient: jest.fn(),
}));

import { isFinalizeConfigured } from '../sync-engine';

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

  it('defaults to reading EXPO_PUBLIC_API_BASE_URL, which is unset in this test build', () => {
    // Expo's babel preset inlines EXPO_PUBLIC_* vars at build time, so this
    // exercises the real default wiring rather than a runtime env mutation.
    expect(isFinalizeConfigured()).toBe(false);
  });
});
