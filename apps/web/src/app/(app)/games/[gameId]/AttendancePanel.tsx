import 'server-only';
import type { JSX } from 'react';
import { createClient } from '@supabase/supabase-js';
import { listGameRsvps } from '@baseball/database';
import { summarizeRsvps, type GameRsvp, type GameRsvpStatus } from '@baseball/shared';

const STATUS_LABEL: Record<GameRsvpStatus, string> = {
  attending: 'Attending',
  maybe: 'Maybe',
  not_attending: "Can't attend",
};

const STATUS_PILL: Record<GameRsvpStatus, string> = {
  attending: 'bg-green-50 text-green-700 border-green-200',
  maybe: 'bg-amber-50 text-amber-700 border-amber-200',
  not_attending: 'bg-gray-100 text-gray-600 border-gray-200',
};

export async function AttendancePanel({
  gameId,
  teamId,
}: {
  gameId: string;
  teamId: string;
}): Promise<JSX.Element> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const [rosterResult, rsvpsResult] = await Promise.allSettled([
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('last_name'),
    listGameRsvps(db as never, gameId),
  ]);

  if (rosterResult.status === 'fulfilled' && rosterResult.value.error) {
    console.error('AttendancePanel: roster fetch failed', { gameId, teamId, err: rosterResult.value.error });
  }
  if (rosterResult.status === 'rejected') {
    console.error('AttendancePanel: roster fetch threw', { gameId, teamId, err: rosterResult.reason });
  }
  if (rsvpsResult.status === 'rejected') {
    console.error('AttendancePanel: RSVP fetch failed', { gameId, teamId, err: rsvpsResult.reason });
  }

  const rosterFailed = rosterResult.status === 'rejected' || Boolean(rosterResult.value.error);
  const rsvpsFailed = rsvpsResult.status === 'rejected';

  if (rosterFailed || rsvpsFailed) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Attendance</h2>
        <p className="text-sm text-gray-400 italic">
          Attendance is temporarily unavailable. Reload to try again.
        </p>
      </div>
    );
  }

  const players = rosterResult.status === 'fulfilled' ? rosterResult.value.data ?? [] : [];
  const rsvps: GameRsvp[] = rsvpsResult.status === 'fulfilled' ? rsvpsResult.value : [];
  const rsvpByPlayer = new Map(rsvps.map((r) => [r.playerId, r]));
  const summary = summarizeRsvps(
    players.map((p) => p.id),
    rsvps,
  );

  const groups: { status: GameRsvpStatus | 'pending'; label: string }[] = [
    { status: 'attending', label: 'Attending' },
    { status: 'maybe', label: 'Maybe' },
    { status: 'not_attending', label: "Can't attend" },
    { status: 'pending', label: 'No response' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Attendance</h2>
        <span className="text-xs text-gray-500">
          {summary.attending} in · {summary.maybe} maybe · {summary.notAttending} out · {summary.pending} pending
        </span>
      </div>

      {players.length === 0 ? (
        <p className="px-5 py-4 text-sm text-gray-400 italic">No active players on the roster.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {groups.map((group) => {
            const rows = players.filter((p) => {
              const rsvp = rsvpByPlayer.get(p.id);
              return (rsvp?.status ?? 'pending') === group.status;
            });
            if (rows.length === 0) return null;

            return (
              <div key={group.status} className="px-5 py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {group.label} ({rows.length})
                </p>
                <div className="space-y-1.5">
                  {rows.map((p) => {
                    const rsvp = rsvpByPlayer.get(p.id);
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-900">
                          {p.jersey_number != null && (
                            <span className="text-gray-400 mr-1.5">#{p.jersey_number}</span>
                          )}
                          {p.first_name} {p.last_name}
                        </span>
                        <div className="flex items-center gap-2">
                          {rsvp?.note && (
                            <span className="text-xs text-gray-400 italic truncate max-w-[10rem]">
                              &ldquo;{rsvp.note}&rdquo;
                            </span>
                          )}
                          {rsvp && (
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded-full border ${STATUS_PILL[rsvp.status]}`}
                            >
                              {STATUS_LABEL[rsvp.status]}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
