import { fakeDb } from '../../__tests__/fake-db';
import { createBooking, createFacility, deleteBooking, deleteFacility, loadFacilitySchedule } from '../facilities';

const TEAM = '11111111-1111-4111-8111-111111111111';
const FACILITY = '22222222-2222-4222-8222-222222222222';
const BOOKING = '33333333-3333-4333-8333-333333333333';
const coach = { 'team_members.select': { data: { role: 'head_coach' } } };
const player = { 'team_members.select': { data: { role: 'player' } } };

const window = { teamId: TEAM, from: '2026-10-18T07:00:00.000Z', to: '2026-10-25T07:00:00.000Z' };

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('loadFacilitySchedule', () => {
  it("should return the team's facilities and the window's bookings on them", async () => {
    const { db, calls } = fakeDb({
      ...player,
      'facilities.select': { data: [{ id: FACILITY, name: 'Cage 1', kind: 'cage', capacity: 4, notes: null, is_active: true }] },
      'facility_bookings.select': {
        data: [{ id: BOOKING, facility_id: FACILITY, starts_at: '2026-10-20T22:00:00+00:00', ends_at: '2026-10-20T23:00:00+00:00', title: 'Hitting', notes: null }],
      },
    });

    const result = await loadFacilitySchedule(db, 'player-user', window);

    expect(result).toEqual({
      ok: true,
      data: {
        teamId: TEAM,
        canManage: false,
        facilities: [{ id: FACILITY, name: 'Cage 1', kind: 'cage', capacity: 4, notes: null, isActive: true }],
        bookings: [{ id: BOOKING, facilityId: FACILITY, startsAt: '2026-10-20T22:00:00+00:00', endsAt: '2026-10-20T23:00:00+00:00', title: 'Hitting', notes: null }],
      },
    });
    expect(calls.find((c) => c.table === 'facility_bookings')?.filters).toEqual({
      facility_id: [FACILITY],
      'starts_at>=': window.from,
      'starts_at<': window.to,
    });
  });

  it('should hide the team from non-members and reject an unbounded window', async () => {
    const stranger = fakeDb({ 'team_members.select': { data: null } });
    expect(await loadFacilitySchedule(stranger.db, 'u', window)).toMatchObject({ ok: false, code: 'not_found' });
    expect(
      await loadFacilitySchedule(stranger.db, 'u', { ...window, to: '2027-10-25T07:00:00.000Z' }),
    ).toMatchObject({ ok: false, code: 'invalid', error: 'The window is too long.' });
  });
});

describe('facilities', () => {
  it('should let a coach add a facility, and report a duplicate name as a conflict', async () => {
    const ok = fakeDb({ ...coach, 'facilities.insert': { data: { id: FACILITY } } });
    expect(await createFacility(ok.db, 'coach', { teamId: TEAM, name: ' Cage 1 ', kind: 'cage', capacity: 4 })).toEqual({
      ok: true,
      data: { facilityId: FACILITY },
    });
    expect(ok.calls.find((c) => c.op === 'insert')?.payload).toEqual({
      team_id: TEAM, name: 'Cage 1', kind: 'cage', capacity: 4, notes: null, created_by: 'coach',
    });

    const dup = fakeDb({ ...coach, 'facilities.insert': { error: { code: '23505', message: 'duplicate' } } });
    expect(await createFacility(dup.db, 'coach', { teamId: TEAM, name: 'Cage 1', kind: 'cage' })).toMatchObject({
      ok: false,
      code: 'conflict',
    });
  });

  it('should refuse anyone but a coach, and only delete within the team', async () => {
    const notCoach = fakeDb(player);
    expect(await createFacility(notCoach.db, 'p', { teamId: TEAM, name: 'Cage', kind: 'cage' })).toMatchObject({ ok: false, code: 'forbidden' });

    const other = fakeDb({ ...coach, 'facilities.delete': { data: [] } });
    expect(await deleteFacility(other.db, 'coach', { teamId: TEAM, facilityId: FACILITY })).toMatchObject({ ok: false, code: 'not_found' });
    expect(other.calls.find((c) => c.op === 'delete')?.filters).toEqual({ id: FACILITY, team_id: TEAM });
  });
});

describe('bookings', () => {
  const booking = { teamId: TEAM, facilityId: FACILITY, startsAt: '2026-10-20T15:00:00-07:00', endsAt: '2026-10-20T16:00:00-07:00', title: 'Hitting' };

  it("should book the team's facility, storing UTC instants", async () => {
    const { db, calls } = fakeDb({ ...coach, 'facilities.select': { data: { id: FACILITY } }, 'facility_bookings.insert': { data: { id: BOOKING } } });
    expect(await createBooking(db, 'coach', booking)).toEqual({ ok: true, data: { bookingId: BOOKING } });
    expect(calls.find((c) => c.table === 'facilities')?.filters).toEqual({ id: FACILITY, team_id: TEAM });
    expect(calls.find((c) => c.op === 'insert')?.payload).toMatchObject({
      facility_id: FACILITY,
      starts_at: '2026-10-20T22:00:00.000Z',
      ends_at: '2026-10-20T23:00:00.000Z',
      title: 'Hitting',
      notes: null,
      created_by: 'coach',
    });
  });

  it('should report an overlap as a conflict and refuse another team\'s facility', async () => {
    const overlap = fakeDb({ ...coach, 'facilities.select': { data: { id: FACILITY } }, 'facility_bookings.insert': { error: { code: '23P01', message: 'conflicting key' } } });
    expect(await createBooking(overlap.db, 'coach', booking)).toMatchObject({ ok: false, code: 'conflict' });

    const elsewhere = fakeDb({ ...coach, 'facilities.select': { data: null } });
    expect(await createBooking(elsewhere.db, 'coach', booking)).toMatchObject({ ok: false, code: 'not_found' });
    expect(elsewhere.calls.some((c) => c.op === 'insert')).toBe(false);
  });

  it('should reject a booking that ends before it starts', async () => {
    const { db, calls } = fakeDb(coach);
    expect(await createBooking(db, 'coach', { ...booking, endsAt: booking.startsAt })).toMatchObject({
      ok: false,
      code: 'invalid',
      error: 'End time must be after start time.',
    });
    expect(calls).toHaveLength(0);
  });

  it("should only delete a booking on the team's own facilities", async () => {
    const missing = fakeDb({ ...coach, 'facility_bookings.select': { data: null } });
    expect(await deleteBooking(missing.db, 'coach', { teamId: TEAM, bookingId: BOOKING })).toMatchObject({ ok: false, code: 'not_found' });
    expect(missing.calls.find((c) => c.table === 'facility_bookings')?.filters).toEqual({ id: BOOKING, 'facilities.team_id': TEAM });
    expect(missing.calls.some((c) => c.op === 'delete')).toBe(false);

    const ok = fakeDb({ ...coach, 'facility_bookings.select': { data: { id: BOOKING } } });
    expect(await deleteBooking(ok.db, 'coach', { teamId: TEAM, bookingId: BOOKING })).toEqual({ ok: true, data: { bookingId: BOOKING } });
  });
});
