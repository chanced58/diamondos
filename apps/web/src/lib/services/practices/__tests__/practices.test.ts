import { SubscriptionTier, practicesListResponseSchema } from '@baseball/shared';
import { cancelPractice, createPractice, listPractices } from '../practices';
import { fakeDb } from '../../__tests__/fake-db';

const mockResolveTeamTier = jest.fn();
jest.mock('@/lib/team-tier', () => ({ resolveTeamTier: (...args: unknown[]) => mockResolveTeamTier(...args) }));
const mockPostEventAlert = jest.fn();
jest.mock('@/app/(app)/messages/notify', () => ({ postEventAlert: (...args: unknown[]) => mockPostEventAlert(...args) }));

const TEAM = '11111111-1111-4111-8111-111111111111';
const PRACTICE = '22222222-2222-4222-8222-222222222222';
const role = (r: string) => ({ data: { role: r } });

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveTeamTier.mockResolvedValue(SubscriptionTier.PRO);
  mockPostEventAlert.mockResolvedValue(undefined);
});

describe('listPractices', () => {
  it("should list the team's practices that aren't cancelled, for any member", async () => {
    const { db, calls } = fakeDb({
      'team_members.select': role('parent'),
      'practices.select': {
        data: [{ id: PRACTICE, scheduled_at: '2026-10-25T16:00:00Z', duration_minutes: 90, location: 'Field 2', run_status: 'not_started', linked_game_id: 'g1' }],
      },
    });
    const result = await listPractices(db, 'me', { teamId: TEAM });
    if (!result.ok) throw new Error(result.error);

    expect(practicesListResponseSchema.parse(result.data)).toEqual(result.data);
    expect(result.data).toMatchObject({ isCoach: false, practices: [{ id: PRACTICE, durationMinutes: 90, isPrep: true }] });
    expect(calls.find((c) => c.table === 'practices')?.filters).toMatchObject({ team_id: TEAM, 'status!=': 'cancelled' });
  });

  it('should refuse a plan without practice planning, and hide the team from outsiders', async () => {
    mockResolveTeamTier.mockResolvedValue(SubscriptionTier.FREE);
    expect(await listPractices(fakeDb({ 'team_members.select': role('head_coach') }).db, 'me', { teamId: TEAM })).toMatchObject({
      ok: false,
      code: 'forbidden',
    });
    expect(await listPractices(fakeDb({ 'team_members.select': { data: null } }).db, 'x', { teamId: TEAM })).toMatchObject({
      ok: false,
      code: 'not_found',
    });
  });
});

describe('createPractice', () => {
  const input = {
    teamId: TEAM,
    scheduledAt: '2026-10-25T23:00:00.000Z',
    durationMinutes: 90,
    location: ' Field 2 ',
    timeZone: 'America/Boise',
    notifyTeam: true,
  };

  it('should create the practice and announce it in the coach’s time zone', async () => {
    const { db, calls } = fakeDb({ 'team_members.select': role('assistant_coach'), 'practices.insert': { data: { id: PRACTICE } } });
    expect(await createPractice(db, 'coach-1', input)).toEqual({ ok: true, data: { practiceId: PRACTICE } });
    expect(calls.find((c) => c.op === 'insert')?.payload).toMatchObject({
      team_id: TEAM,
      scheduled_at: input.scheduledAt,
      duration_minutes: 90,
      location: 'Field 2',
      created_by: 'coach-1',
    });
    // 23:00 UTC is 5:00 PM in Boise, not the server's UTC.
    expect(mockPostEventAlert).toHaveBeenCalledWith(db, TEAM, 'coach-1', expect.stringContaining('5:00 PM @ Field 2'));
  });

  it('should refuse a player, and still succeed when the announcement fails', async () => {
    const player = fakeDb({ 'team_members.select': role('player') });
    expect(await createPractice(player.db, 'p1', input)).toMatchObject({ ok: false, code: 'forbidden' });
    expect(player.calls.some((c) => c.op === 'insert')).toBe(false);

    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockPostEventAlert.mockRejectedValue(new Error('no channel'));
    const coach = fakeDb({ 'team_members.select': role('head_coach'), 'practices.insert': { data: { id: PRACTICE } } });
    expect(await createPractice(coach.db, 'coach-1', input)).toMatchObject({ ok: true });
  });
});

describe('cancelPractice', () => {
  const practiceRow = { data: { id: PRACTICE, team_id: TEAM, scheduled_at: '2026-10-25T23:00:00Z', status: 'scheduled', latitude: null, longitude: null } };

  it("should cancel for a coach of the practice's own team", async () => {
    const { db, calls } = fakeDb({ 'practices.select': practiceRow, 'team_members.select': role('head_coach') });
    expect(await cancelPractice(db, 'coach-1', { practiceId: PRACTICE })).toEqual({ ok: true, data: { practiceId: PRACTICE } });
    const update = calls.find((c) => c.op === 'update')!;
    expect(update.filters).toEqual({ id: PRACTICE });
    expect(update.payload).toMatchObject({ status: 'cancelled' });
    // The coach check used the practice's team.
    expect(calls.find((c) => c.table === 'team_members')?.filters).toMatchObject({ team_id: TEAM });
    expect(mockPostEventAlert).not.toHaveBeenCalled();
  });

  it('should refuse a parent and a missing practice', async () => {
    expect(await cancelPractice(fakeDb({ 'practices.select': practiceRow, 'team_members.select': role('parent') }).db, 'p', { practiceId: PRACTICE }))
      .toMatchObject({ ok: false, code: 'forbidden' });
    expect(await cancelPractice(fakeDb({ 'practices.select': { data: null } }).db, 'c', { practiceId: PRACTICE }))
      .toMatchObject({ ok: false, code: 'not_found' });
  });
});
