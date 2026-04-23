'use client';
import type { JSX } from 'react';
import { useState, useTransition } from 'react';
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const weekStartDate = new Date(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + i);
    return d;
  });
  const facilityById = new Map(facilities.map((f) => [f.id, f]));
  const bookingsByDay: Record<number, Booking[]> = {};

  // DST-safe bucketing: compare local-calendar midnights rather than dividing
  // raw ms by 86_400_000 (which miscounts on the spring-forward/fall-back day).
  const weekStartMidnight = new Date(weekStartDate);
  weekStartMidnight.setHours(0, 0, 0, 0);
  for (const b of bookings) {
    const startLocal = new Date(b.starts_at);
    startLocal.setHours(0, 0, 0, 0);
    const dayIdx = Math.round(
      (startLocal.getTime() - weekStartMidnight.getTime()) / 86_400_000,
    );
    if (dayIdx >= 0 && dayIdx < 7) {
      (bookingsByDay[dayIdx] ??= []).push(b);
    }
  }

  function handleDelete(bookingId: string) {
    if (!confirm('Delete this booking?')) return;
    const fd = new FormData();
    fd.append('bookingId', bookingId);
    setDeleteError(null);
    startTransition(() => {
      deleteBookingAction(null, fd).then((result) => {
        if (result) setDeleteError(result);
      });
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
    <div>
      {deleteError && (
        <p className="text-sm text-red-600 mb-2">{deleteError}</p>
      )}
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
    </div>
  );
}
