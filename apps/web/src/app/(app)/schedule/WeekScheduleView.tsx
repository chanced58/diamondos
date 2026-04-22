'use client';
import type { JSX } from 'react';
import { useTransition } from 'react';
import { deleteBookingAction } from './actions';

type Facility = { id: string; name: string; kind: string };
type Booking = {
  id: string;
  facility_id: string;
  starts_at: string;
  ends_at: string;
  title: string;
  notes: string | null;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function WeekScheduleView({
  weekStart,
  facilities,
  bookings,
  canManage,
}: {
  weekStart: string;
  facilities: Facility[];
  bookings: Booking[];
  canManage: boolean;
}): JSX.Element {
  const [isPending, startTransition] = useTransition();
  const weekStartDate = new Date(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d;
  });
  const facilityById = new Map(facilities.map((f) => [f.id, f]));
  const bookingsByDay: Record<number, Booking[]> = {};
  for (const b of bookings) {
    const dayIdx = Math.floor((new Date(b.starts_at).getTime() - weekStartDate.getTime()) / 86_400_000);
    if (dayIdx >= 0 && dayIdx < 7) {
      (bookingsByDay[dayIdx] ??= []).push(b);
    }
  }

  function handleDelete(bookingId: string) {
    if (!confirm('Delete this booking?')) return;
    const fd = new FormData();
    fd.append('bookingId', bookingId);
    startTransition(() => {
      void deleteBookingAction(null, fd);
    });
  }

  if (facilities.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-12 text-center">
        <p className="text-sm text-gray-500">No facilities yet.</p>
        <p className="text-xs text-gray-400 mt-1">
          Add a cage, field, or bullpen below to start booking.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map((day, i) => {
        const dayBookings = (bookingsByDay[i] ?? []).sort(
          (a, b) => a.starts_at.localeCompare(b.starts_at),
        );
        return (
          <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-semibold text-gray-900">
                {DAYS[day.getDay()]} {day.getDate()}
              </p>
            </div>
            <div className="p-2 space-y-1.5 min-h-[120px]">
              {dayBookings.length === 0 ? (
                <p className="text-xs text-gray-300 italic px-1 py-2">No bookings</p>
              ) : (
                dayBookings.map((b) => {
                  const f = facilityById.get(b.facility_id);
                  return (
                    <div key={b.id} className="border border-blue-200 bg-blue-50 rounded-md px-2 py-1.5">
                      <p className="text-xs font-semibold text-blue-900">
                        {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
                      </p>
                      <p className="text-xs text-gray-900 truncate" title={b.title}>
                        {b.title}
                      </p>
                      {f && (
                        <p className="text-[10px] text-blue-700 uppercase tracking-wide">
                          {f.name}
                        </p>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleDelete(b.id)}
                          className="text-[10px] text-red-600 hover:text-red-800 mt-1 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
