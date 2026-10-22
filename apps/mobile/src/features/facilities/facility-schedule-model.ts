import type { CreateBookingInput, FacilityBooking } from '@baseball/shared';
import { localDateFromParts, partsFromLocalDate } from '../forms/date-parts';

/**
 * The facility week view's date math, in the device's zone like the web
 * /schedule page (which uses the browser's): weeks start on Sunday.
 */

/** Local midnight of the Sunday on or before `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function addWeeks(weekStart: Date, weeks: number): Date {
  const next = new Date(weekStart);
  next.setDate(next.getDate() + weeks * 7);
  return next;
}

/** The ISO window a schedule read covers: the week's seven local days. */
export function weekWindow(weekStart: Date): { from: string; to: string } {
  return { from: weekStart.toISOString(), to: addWeeks(weekStart, 1).toISOString() };
}

export interface BookingDay {
  /** Local midnight of the day. */
  date: Date;
  bookings: FacilityBooking[];
}

/** The week's seven days, each with the bookings that start on it, in time order. */
export function bookingsByDay(weekStart: Date, bookings: FacilityBooking[]): BookingDay[] {
  const days: BookingDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    return { date, bookings: [] };
  });
  for (const booking of [...bookings].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) {
    const start = new Date(booking.startsAt);
    days.find((d) => isSameLocalDay(d.date, start))?.bookings.push(booking);
  }
  return days;
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "3:00 PM – 4:30 PM". */
export function timeRange(startsAt: string, endsAt: string): string {
  const format = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${format(startsAt)} – ${format(endsAt)}`;
}

export interface BookingFormValues {
  facilityId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  notes: string;
}

/** A new booking's defaults: the next whole hour, for an hour, on `day` (today if this week). */
export function bookingFormDefaults(day: Date, now: Date = new Date()): BookingFormValues {
  const start = isSameLocalDay(day, now) ? new Date(now) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15);
  start.setMinutes(0, 0, 0);
  if (isSameLocalDay(day, now)) start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60_000);
  const startParts = partsFromLocalDate(start);
  return {
    facilityId: null,
    date: startParts.date,
    startTime: startParts.time,
    // A booking can't cross midnight, so a late default ends at the day's end.
    endTime: isSameLocalDay(end, start) ? partsFromLocalDate(end).time : '23:59',
    title: '',
    notes: '',
  };
}

/** The form problem to show, or null when it can be sent. */
export function validateBookingForm(values: BookingFormValues): string | null {
  if (!values.facilityId) return 'Choose a facility.';
  if (!values.title.trim()) return 'Title is required.';
  const start = localDateFromParts(values.date, values.startTime);
  const end = localDateFromParts(values.date, values.endTime);
  if (end <= start) return 'End time must be after start time.';
  return null;
}

/** The API body: the device's wall-clock times as instants. */
export function bookingInput(values: BookingFormValues): Omit<CreateBookingInput, 'teamId'> {
  return {
    facilityId: values.facilityId ?? '',
    startsAt: localDateFromParts(values.date, values.startTime).toISOString(),
    endsAt: localDateFromParts(values.date, values.endTime).toISOString(),
    title: values.title.trim(),
    notes: values.notes.trim() || null,
  };
}
