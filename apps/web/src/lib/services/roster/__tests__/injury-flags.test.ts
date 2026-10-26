import { addInjuryFlag, endInjuryFlag, loadPlayerAvailability } from '../injury-flags';
import { fakeDb } from '../../__tests__/fake-db';

const mockGetRosterAccess = jest.fn();
jest.mock('@/lib/roster-access', () => ({
  getRosterAccess: (...args: unknown[]) => mockGetRosterAccess(...args),
}));

const TEAM = '11111111-1111-4111-8111-111111111111';
const PLAYER = '22222222-2222-4222-8222-222222222222';
const FLAG = '33333333-3333-4333-8333-333333333333';
const player = { data: { id: PLAYER, first_name: 'Sam', last_name: 'Lee', jersey_number: 7 } };
const flag = (extra = {}) => ({ teamId: TEAM, playerId: PLAYER, injurySlug: 'shoulder', effectiveFrom: '2026-10-01', ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  mockGetRosterAccess.mockResolvedValue({ canView: true, canManage: true, role: 'head_coach' });
});

describe('loadPlayerAvailability', () => {
  it('should return the flags and the team’s injury catalog', async () => {
    const { db, calls } = fakeDb({
      'players.select': player,
      'injury_flag_catalog.select': { data: [{ slug: 'shoulder', name: 'Shoulder', body_part: 'upper_body', description: null }] },
      'player_injury_flags.select': { data: [{ id: FLAG, injury_slug: 'shoulder', effective_from: '2026-10-01', effective_to: null, notes: 'Rest' }] },
    });
    const result = await loadPlayerAvailability(db, 'u1', { teamId: TEAM, playerId: PLAYER });
    expect(result).toEqual({
      ok: true,
      data: {
        player: { id: PLAYER, firstName: 'Sam', lastName: 'Lee', jerseyNumber: 7 },
        flags: [{ id: FLAG, injurySlug: 'shoulder', effectiveFrom: '2026-10-01', effectiveTo: null, notes: 'Rest' }],
        catalog: [{ slug: 'shoulder', name: 'Shoulder', bodyPart: 'upper_body', description: null }],
      },
    });
    expect(calls.find((c) => c.table === 'injury_flag_catalog')?.filters.or).toBe(`visibility.eq.system,team_id.eq.${TEAM}`);
    expect(calls.find((c) => c.table === 'players')?.filters).toEqual({ id: PLAYER, team_id: TEAM });
  });

  it('should refuse team members who can’t manage, and hide the player from strangers', async () => {
    mockGetRosterAccess.mockResolvedValueOnce({ canView: true, canManage: false, role: 'parent' });
    mockGetRosterAccess.mockResolvedValueOnce({ canView: false, canManage: false, role: null });
    const { db, calls } = fakeDb({ 'players.select': player });
    expect(await loadPlayerAvailability(db, 'u1', { teamId: TEAM, playerId: PLAYER })).toMatchObject({ code: 'forbidden' });
    expect(await loadPlayerAvailability(db, 'u1', { teamId: TEAM, playerId: PLAYER })).toMatchObject({ code: 'not_found' });
    expect(calls).toHaveLength(0);
  });

  it('should say not found for a player on another team', async () => {
    const { db } = fakeDb({});
    expect(await loadPlayerAvailability(db, 'u1', { teamId: TEAM, playerId: PLAYER })).toMatchObject({ code: 'not_found' });
  });
});

describe('addInjuryFlag', () => {
  it('should add a flag from the team’s catalog', async () => {
    const { db, calls } = fakeDb({
      'players.select': player,
      'injury_flag_catalog.select': { data: { slug: 'shoulder' } },
      'player_injury_flags.insert': { data: { id: FLAG } },
    });
    const result = await addInjuryFlag(db, 'u1', flag({ effectiveTo: '', notes: '  Rest a week  ' }));
    expect(result).toEqual({ ok: true, data: { flagId: FLAG } });
    expect(calls.find((c) => c.table === 'player_injury_flags')?.payload).toEqual({
      player_id: PLAYER,
      injury_slug: 'shoulder',
      effective_from: '2026-10-01',
      effective_to: null,
      notes: 'Rest a week',
      created_by: 'u1',
    });
  });

  it('should refuse an injury the team can’t use and an end before the start', async () => {
    const { db, calls } = fakeDb({ 'players.select': player });
    expect(await addInjuryFlag(db, 'u1', flag())).toMatchObject({ code: 'invalid', error: 'Pick an injury from the list.' });
    expect(await addInjuryFlag(db, 'u1', flag({ effectiveTo: '2026-09-30' }))).toMatchObject({
      code: 'invalid',
      error: 'End date must be on or after start date.',
    });
    expect(calls.some((c) => c.table === 'player_injury_flags')).toBe(false);
  });

  it('should explain a second open-ended flag for the same injury', async () => {
    const { db } = fakeDb({
      'players.select': player,
      'injury_flag_catalog.select': { data: { slug: 'shoulder' } },
      'player_injury_flags.insert': { error: { code: '23505', message: 'duplicate key' } },
    });
    expect(await addInjuryFlag(db, 'u1', flag())).toMatchObject({ code: 'conflict', error: expect.stringContaining('End it first') });
  });
});

describe('endInjuryFlag', () => {
  it('should end the player’s flag on the given day', async () => {
    const { db, calls } = fakeDb({ 'players.select': player, 'player_injury_flags.select': { data: { id: FLAG, effective_from: '2026-10-01' } } });
    expect(await endInjuryFlag(db, 'u1', { teamId: TEAM, playerId: PLAYER, flagId: FLAG, endDate: '2026-10-25' })).toEqual({
      ok: true,
      data: { flagId: FLAG },
    });
    const update = calls.find((c) => c.table === 'player_injury_flags' && c.op === 'update');
    expect(update).toMatchObject({ payload: { effective_to: '2026-10-25' }, filters: { id: FLAG, player_id: PLAYER } });
  });

  it('should not end another player’s flag or end one before it starts', async () => {
    const missing = fakeDb({ 'players.select': player });
    expect(await endInjuryFlag(missing.db, 'u1', { teamId: TEAM, playerId: PLAYER, flagId: FLAG, endDate: '2026-10-25' })).toMatchObject({
      code: 'not_found',
    });
    const early = fakeDb({ 'players.select': player, 'player_injury_flags.select': { data: { id: FLAG, effective_from: '2026-11-01' } } });
    expect(await endInjuryFlag(early.db, 'u1', { teamId: TEAM, playerId: PLAYER, flagId: FLAG, endDate: '2026-10-25' })).toMatchObject({
      code: 'invalid',
    });
    expect(early.calls.some((c) => c.op === 'update')).toBe(false);
  });
});
