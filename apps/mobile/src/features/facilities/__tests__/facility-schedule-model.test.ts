import type { FacilityBooking } from '@baseball/shared';
import {
  addWeeks,
  bookingFormDefaults,
  bookingInput,
  bookingsByDay,
  startOfWeek,
  validateBookingForm,
  weekWindow,
} from '../facility-schedule-model';

// Built from local components, so the tests hold in any device zone.
const local = (month: number, day: number, hour = 0, minute = 0) => new Date(2026, month - 1, day, hour, minute);

const booking = (id: string, start: Date, minutes = 60): FacilityBooking => ({
  id,
  facilityId: 'f1',
  startsAt: start.toISOString(),
  endsAt: new Date(start.getTime() + minutes * 60_000).toISOString(),
  title: id,
  notes: null,
});

describe('weeks', () => {
  it('should start the week at local midnight on Sunday', () => {
    // Wed Oct 21 2026 → Sun Oct 18.
    expect(startOfWeek(local(10, 21, 15, 30))).toEqual(local(10, 18));
    expect(startOfWeek(local(10, 18))).toEqual(local(10, 18));
    expect(addWeeks(local(10, 18), -1)).toEqual(local(10, 11));
  });

  it("should read the week's seven local days", () => {
    expect(weekWindow(local(10, 18))).toEqual({ from: local(10, 18).toISOString(), to: local(10, 25).toISOString() });
  });

  it('should group bookings under the local day they start, in time order', () => {
    const days = bookingsByDay(local(10, 18), [booking('late', local(10, 20, 18)), booking('early', local(10, 20, 9)), booking('sat', local(10, 24, 23, 30))]);
    expect(days).toHaveLength(7);
    expect(days[2].bookings.map((b) => b.id)).toEqual(['early', 'late']);
    expect(days[6].bookings.map((b) => b.id)).toEqual(['sat']);
    expect(days[0].bookings).toEqual([]);
  });
});

describe('booking form', () => {
  it('should default to the next whole hour today, or 3 PM on another day', () => {
    const now = local(10, 21, 14, 20);
    expect(bookingFormDefaults(local(10, 21), now)).toMatchObject({ date: '2026-10-21', startTime: '15:00', endTime: '16:00' });
    expect(bookingFormDefaults(local(10, 18), now)).toMatchObject({ date: '2026-10-18', startTime: '15:00', endTime: '16:00' });
  });

  it('should keep a late default on one day, valid as it opens', () => {
    const late = bookingFormDefaults(local(10, 21), local(10, 21, 22, 30));
    expect(late).toMatchObject({ date: '2026-10-21', startTime: '23:00', endTime: '23:59' });
    expect(validateBookingForm({ ...late, facilityId: 'f1', title: 'Late' })).toBeNull();
  });

  it('should require a facility, a title and an end after the start', () => {
    const values = { ...bookingFormDefaults(local(10, 18)), facilityId: 'f1', title: 'Hitting' };
    expect(validateBookingForm(values)).toBeNull();
    expect(validateBookingForm({ ...values, facilityId: null })).toBe('Choose a facility.');
    expect(validateBookingForm({ ...values, title: ' ' })).toBe('Title is required.');
    expect(validateBookingForm({ ...values, endTime: '14:00' })).toBe('End time must be after start time.');
  });

  it('should send the wall-clock times as instants', () => {
    const values = { facilityId: 'f1', date: '2026-10-20', startTime: '15:00', endTime: '16:30', title: ' Hitting ', notes: '' };
    expect(bookingInput(values)).toEqual({
      facilityId: 'f1',
      startsAt: local(10, 20, 15).toISOString(),
      endsAt: local(10, 20, 16, 30).toISOString(),
      title: 'Hitting',
      notes: null,
    });
  });
});
