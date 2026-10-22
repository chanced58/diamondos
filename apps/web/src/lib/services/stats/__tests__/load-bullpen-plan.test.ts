import {
  bullpenResponseSchema,
  PitcherAvailabilityStatus,
  PitcherEligibilitySource,
} from '@baseball/shared';
import { loadBullpenPlan } from '../load-bullpen-plan';
import { fakeDb } from '../../__tests__/fake-db';

const mockListPitchersWithUsage = jest.fn();
const mockGetNextGameForTeam = jest.fn();
jest.mock('@baseball/database', () => ({
  listPitchersWithUsage: (...args: unknown[]) => mockListPitchersWithUsage(...args),
  getNextGameForTeam: (...args: unknown[]) => mockGetNextGameForTeam(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const coach = { 'team_members.select': { data: { role: 'assistant_coach' } } };

const plan = {
  rule: { ruleName: 'NFHS', maxPitchesPerDay: 110 },
  pitchers: [
    {
      player: { id: 'p1', firstName: 'Luke', lastName: 'Fox', jerseyNumber: 12, throws: 'right' },
      availability: {
        playerId: 'p1', status: PitcherAvailabilityStatus.UNAVAILABLE, nextAvailableDate: '2026-10-23',
        pitchesLast7d: 80, reason: 'Threw 80 Tue → rest 2 days → clears Fri',
      },
      eligibilitySource: PitcherEligibilitySource.PRIMARY,
    },
    {
      player: { id: 'p2', firstName: 'Ann', lastName: 'Coit' },
      availability: {
        playerId: 'p2', status: PitcherAvailabilityStatus.LIMITED, nextAvailableDate: null,
        pitchesLast7d: 20, remainingPitches: 15, reason: 'Limited',
      },
      eligibilitySource: PitcherEligibilitySource.GAME_HISTORY,
    },
  ],
};

/** The UTC day `listPitchersWithUsage` was asked about. */
function plannedDay(): string {
  return (mockListPitchersWithUsage.mock.calls[0][2] as Date).toISOString().slice(0, 10);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListPitchersWithUsage.mockResolvedValue(plan);
  mockGetNextGameForTeam.mockResolvedValue(null);
});

describe('loadBullpenPlan', () => {
  it('should reject a malformed or impossible date as invalid, not a server error', async () => {
    const { db } = fakeDb(coach);
    expect(await loadBullpenPlan(db, 'c1', { teamId: TEAM, date: '10/21/2026' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await loadBullpenPlan(db, 'c1', { teamId: TEAM, date: '2026-13-45' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(await loadBullpenPlan(db, 'c1', { teamId: TEAM, today: '2026-02-30' })).toMatchObject({ ok: false, code: 'invalid' });
    expect(mockListPitchersWithUsage).not.toHaveBeenCalled();
  });

  it('should hide the team from outsiders and refuse non-coach members', async () => {
    expect(await loadBullpenPlan(fakeDb().db, 'stranger', { teamId: TEAM })).toMatchObject({ ok: false, code: 'not_found' });
    const parent = fakeDb({ 'team_members.select': { data: { role: 'parent' } } });
    expect(await loadBullpenPlan(parent.db, 'parent-1', { teamId: TEAM })).toMatchObject({ ok: false, code: 'forbidden' });
    expect(mockListPitchersWithUsage).not.toHaveBeenCalled();
  });

  it('should plan the requested day and flatten each pitcher for the app', async () => {
    const { db } = fakeDb(coach);
    const result = await loadBullpenPlan(db, 'c1', { teamId: TEAM, date: '2026-10-21' });
    if (!result.ok) throw new Error(result.error);

    expect(bullpenResponseSchema.parse(result.data)).toEqual(result.data);
    expect(plannedDay()).toBe('2026-10-21');
    expect(mockGetNextGameForTeam).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ date: '2026-10-21', dateSource: 'requested', rule: { ruleName: 'NFHS' } });
    expect(result.data.pitchers[1]).toEqual({
      playerId: 'p2', firstName: 'Ann', lastName: 'Coit', jerseyNumber: null, throws: null,
      eligibility: 'game_history', status: 'limited', pitchesLast7d: 20, nextAvailableDate: null,
      remainingPitches: 15, reason: 'Limited',
    });
  });

  it("should default to the next game's day in the game's time zone", async () => {
    // 7 PM in Phoenix on the 24th is 02:00 UTC on the 25th.
    mockGetNextGameForTeam.mockResolvedValue({ scheduledAt: '2026-10-25T02:00:00Z', timeZone: 'America/Phoenix' });
    const { db } = fakeDb(coach);
    const result = await loadBullpenPlan(db, 'c1', { teamId: TEAM, today: '2026-10-21' });

    expect(result).toMatchObject({ ok: true, data: { date: '2026-10-24', dateSource: 'next_game' } });
    expect(plannedDay()).toBe('2026-10-24');
  });

  it("should fall back to the device's today without a next game", async () => {
    const { db } = fakeDb(coach);
    const result = await loadBullpenPlan(db, 'c1', { teamId: TEAM, today: '2026-10-21' });
    expect(result).toMatchObject({ ok: true, data: { date: '2026-10-21', dateSource: 'today' } });
  });

  it('should fail cleanly when the roster or rule cannot be read', async () => {
    mockListPitchersWithUsage.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const { db } = fakeDb(coach);
    expect(await loadBullpenPlan(db, 'c1', { teamId: TEAM, date: '2026-10-21' })).toMatchObject({ ok: false, code: 'failed' });
  });
});
