import { bullpenResponseSchema, seasonStatsResponseSchema } from '@baseball/shared';
import type { ApiClient } from '../../../lib/api-client';
import { fetchBullpenPlan, fetchSeasonStats, localToday } from '../season-stats-api';

function client() {
  const get = jest.fn().mockResolvedValue({});
  return { client: { get } as unknown as ApiClient, get };
}

describe('fetchSeasonStats', () => {
  it("should ask for the server's default season unless one is picked", async () => {
    const { client: c, get } = client();
    await fetchSeasonStats('team 1', undefined, c);
    await fetchSeasonStats('team 1', 'all', c);
    expect(get).toHaveBeenNthCalledWith(1, '/teams/team%201/stats', seasonStatsResponseSchema);
    expect(get).toHaveBeenNthCalledWith(2, '/teams/team%201/stats?season=all', seasonStatsResponseSchema);
  });
});

describe('fetchBullpenPlan', () => {
  it("should always send the device's day, and the picked day when there is one", async () => {
    const { client: c, get } = client();
    const today = localToday();
    await fetchBullpenPlan('t1', undefined, c);
    await fetchBullpenPlan('t1', '2026-10-24', c);
    expect(get).toHaveBeenNthCalledWith(1, `/teams/t1/bullpen?today=${today}`, bullpenResponseSchema);
    expect(get).toHaveBeenNthCalledWith(2, `/teams/t1/bullpen?today=${today}&date=2026-10-24`, bullpenResponseSchema);
  });
});

describe('localToday', () => {
  it('should use the device clock, not UTC', () => {
    // 11:30 PM local on the 21st is still the 21st on the device.
    expect(localToday(new Date(2026, 9, 21, 23, 30))).toBe('2026-10-21');
  });
});
