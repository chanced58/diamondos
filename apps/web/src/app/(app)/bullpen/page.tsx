import type { JSX } from 'react';
import { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getActiveTeam } from '@/lib/active-team';
import { getUserAccess } from '@/lib/user-access';
import { PitcherAvailabilityStatus, PitcherEligibilitySource } from '@baseball/shared';
import { listPitchersWithUsage, getNextGameForTeam } from '@baseball/database';
import { BullpenDateControl } from './BullpenDateControl';

export const metadata: Metadata = { title: 'Bullpen Planner' };

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

const STATUS_STYLES: Record<PitcherAvailabilityStatus, { pill: string; label: string }> = {
  [PitcherAvailabilityStatus.AVAILABLE]: {
    pill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    label: 'Available',
  },
  [PitcherAvailabilityStatus.LIMITED]: {
    pill: 'bg-amber-50 text-amber-800 border-amber-200',
    label: 'Limited',
  },
  [PitcherAvailabilityStatus.UNAVAILABLE]: {
    pill: 'bg-red-50 text-red-800 border-red-200',
    label: 'Unavailable',
  },
};

const ELIGIBILITY_STYLES: Record<PitcherEligibilitySource, { pill: string; label: string }> = {
  [PitcherEligibilitySource.PRIMARY]: {
    pill: 'bg-gray-100 text-gray-700 border-gray-200',
    label: 'Primary',
  },
  [PitcherEligibilitySource.SECONDARY]: {
    pill: 'bg-sky-50 text-sky-800 border-sky-200',
    label: 'Secondary',
  },
  [PitcherEligibilitySource.GAME_HISTORY]: {
    pill: 'bg-violet-50 text-violet-800 border-violet-200',
    label: 'Game history',
  },
};

export default async function BullpenPage({ searchParams }: PageProps): Promise<JSX.Element | null> {
  const sp = await searchParams;
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const activeTeam = await getActiveTeam(auth, user.id);
  if (!activeTeam) {
    return <div className="p-8 text-gray-500">No active team.</div>;
  }

  const { isCoach } = await getUserAccess(activeTeam.id, user.id);
  if (!isCoach) {
    return <div className="p-8 text-gray-500">Only coaches can access the bullpen planner.</div>;
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Default target date: next scheduled game's date, or today if none.
  // Parse YYYY-MM-DD as local (not UTC) so it round-trips with toDateInput().
  let targetDate: Date;
  if (sp?.date) {
    targetDate = parseLocalDate(sp.date);
  } else {
    const nextGame = await getNextGameForTeam(db as never, activeTeam.id);
    targetDate = nextGame ? new Date(nextGame.scheduledAt) : new Date();
  }

  const { rule, pitchers } = await listPitchersWithUsage(db as never, activeTeam.id, targetDate);

  const availableCount = pitchers.filter((p) => p.availability.status === PitcherAvailabilityStatus.AVAILABLE).length;
  const limitedCount = pitchers.filter((p) => p.availability.status === PitcherAvailabilityStatus.LIMITED).length;
  const unavailableCount = pitchers.filter((p) => p.availability.status === PitcherAvailabilityStatus.UNAVAILABLE).length;

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/practices" className="text-sm text-brand-700 hover:underline">
        ← Back to practices
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-2">Bullpen Planner</h1>
      <p className="text-gray-500 text-sm mt-1">
        {activeTeam.name}
        {rule && <> · Rule: <span className="text-gray-700">{rule.ruleName}</span> ({rule.maxPitchesPerDay} max/day)</>}
      </p>

      {!rule && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          No active pitch compliance rule for this team. Configure one under Admin → Compliance to enable rest-day computation.
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
        <BullpenDateControl initialDate={toDateInput(targetDate)} />
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span>{availableCount} available</span>
          <span className="text-gray-300">·</span>
          <span>{limitedCount} limited</span>
          <span className="text-gray-300">·</span>
          <span>{unavailableCount} unavailable</span>
        </div>
      </div>

      <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left py-2 px-4 font-medium">Pitcher</th>
              <th className="text-left py-2 px-4 font-medium">Eligibility</th>
              <th className="text-left py-2 px-4 font-medium">Status</th>
              <th className="text-left py-2 px-4 font-medium">Last 7d</th>
              <th className="text-left py-2 px-4 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pitchers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                  No pitchers found. Add players with pitcher as a primary or secondary position, or scorekeep a game to include pitchers by game history.
                </td>
              </tr>
            )}
            {pitchers.map(({ player, availability, eligibilitySource }) => {
              const style = STATUS_STYLES[availability.status];
              const elig = ELIGIBILITY_STYLES[eligibilitySource];
              return (
                <tr key={player.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-gray-900">
                      {player.lastName}, {player.firstName}
                      {player.jerseyNumber !== undefined && (
                        <span className="ml-2 text-xs text-gray-400">#{player.jerseyNumber}</span>
                      )}
                    </div>
                    {player.throws && (
                      <div className="text-xs text-gray-500">{handednessLabel(player.throws)}HP</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${elig.pill}`}>
                      {elig.label}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${style.pill}`}>
                      {style.label}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-700">{availability.pitchesLast7d}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{availability.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function toDateInput(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Parses a YYYY-MM-DD string as a Date at local midnight. `new Date("YYYY-MM-DD")`
 * is specified to be UTC, which causes off-by-one days when rendering via
 * toDateInput() in non-UTC timezones — so we construct explicitly with
 * year/month/day in local time.
 */
function parseLocalDate(s: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return new Date(s);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

function handednessLabel(throws: string): 'R' | 'L' | 'S' {
  if (throws === 'left') return 'L';
  if (throws === 'switch') return 'S';
  return 'R';
}
