import type { JSX } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { FacilityManager } from './FacilityManager';
import { WeekScheduleView } from './WeekScheduleView';
import { NewBookingForm } from './NewBookingForm';

export const metadata: Metadata = { title: 'Schedule' };

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  const diff = d.getDate() - day;
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: { week?: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect('/login');

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) redirect('/dashboard');

  const access = await getUserAccess(activeTeam.id, user.id);

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const weekStartDate = searchParams.week
    ? startOfWeek(new Date(searchParams.week))
    : startOfWeek(new Date());
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 7);

  const [facilitiesResult, bookingsResult] = await Promise.all([
    db
      .from('facilities')
      .select('id, name, kind, capacity, notes, is_active')
      .eq('team_id', activeTeam.id)
      .order('name'),
    db
      .from('facility_bookings')
      .select('id, facility_id, starts_at, ends_at, title, notes')
      .gte('starts_at', weekStartDate.toISOString())
      .lt('starts_at', weekEndDate.toISOString())
      .order('starts_at'),
  ]);

  const facilities = facilitiesResult.data ?? [];
  const activeFacilities = facilities.filter((f) => f.is_active);
  // Filter bookings to this team's facilities (RLS also enforces this).
  const facilityIds = new Set(facilities.map((f) => f.id));
  const bookings = (bookingsResult.data ?? []).filter((b) => facilityIds.has(b.facility_id));

  const prevWeek = new Date(weekStartDate);
  prevWeek.setDate(prevWeek.getDate() - 7);
  const nextWeek = new Date(weekStartDate);
  nextWeek.setDate(nextWeek.getDate() + 7);

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <p className="text-gray-500 text-sm mt-1">
          Facility bookings for your team. Conflicts are rejected at the database level — two overlapping bookings on the same cage are impossible.
        </p>
      </div>

      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2">
          <Link
            href={`/schedule?week=${prevWeek.toISOString().slice(0, 10)}`}
            className="px-3 py-1 text-xs rounded-md bg-white border border-gray-300 hover:bg-gray-50"
          >
            ← Previous
          </Link>
          <span className="text-sm font-medium text-gray-900">
            Week of {weekStartDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
          <Link
            href={`/schedule?week=${nextWeek.toISOString().slice(0, 10)}`}
            className="px-3 py-1 text-xs rounded-md bg-white border border-gray-300 hover:bg-gray-50"
          >
            Next →
          </Link>
        </div>
        <Link
          href="/schedule"
          className="px-3 py-1 text-xs rounded-md bg-white border border-gray-300 hover:bg-gray-50"
        >
          Today
        </Link>
      </div>

      <WeekScheduleView
        weekStart={weekStartDate.toISOString()}
        facilities={activeFacilities}
        bookings={bookings}
        canManage={access.isCoach}
      />

      {access.isCoach && activeFacilities.length > 0 && (
        <section className="mt-8 bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">New booking</h2>
          <NewBookingForm facilities={activeFacilities} defaultDate={weekStartDate.toISOString().slice(0, 10)} />
        </section>
      )}

      {access.isCoach && (
        <section className="mt-8">
          <FacilityManager facilities={facilities} />
        </section>
      )}
    </div>
  );
}
