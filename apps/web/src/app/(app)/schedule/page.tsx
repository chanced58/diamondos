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

// Parse a "YYYY-MM-DD" string as a *local* calendar date, not as a UTC instant.
// (new Date("2026-04-22") is UTC midnight, which shifts by a day in most zones.)
function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day);
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
    ? startOfWeek(parseLocalYmd(searchParams.week))
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
    <div className="page" style={{ maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="eyebrow">Facility bookings</div>
        <h1 className="display" style={{ fontSize: 34, marginTop: 4 }}>Schedule</h1>
        <p style={{ color: 'var(--app-fg-muted)', fontSize: 13, marginTop: 4 }}>
          Conflicts are rejected at the database level — two overlapping bookings on the same cage are impossible.
        </p>
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link href={`/schedule?week=${prevWeek.toISOString().slice(0, 10)}`} className="btn btn-ghost btn-sm">
              ← Prev
            </Link>
            <span className="display" style={{ fontSize: 16 }}>
              Week of {weekStartDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <Link href={`/schedule?week=${nextWeek.toISOString().slice(0, 10)}`} className="btn btn-ghost btn-sm">
              Next →
            </Link>
          </div>
          <Link href="/schedule" className="btn btn-ghost btn-sm">Today</Link>
        </div>
      </div>

      <WeekScheduleView
        weekStart={weekStartDate.toISOString()}
        facilities={activeFacilities}
        bookings={bookings}
        canManage={access.isCoach}
      />

      {access.isCoach && activeFacilities.length > 0 && (
        <section className="card" style={{ marginTop: 20, padding: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>Book a facility</div>
          <NewBookingForm facilities={activeFacilities} defaultDate={weekStartDate.toISOString().slice(0, 10)} />
        </section>
      )}

      {access.isCoach && (
        <section style={{ marginTop: 20 }}>
          <FacilityManager facilities={facilities} />
        </section>
      )}
    </div>
  );
}
