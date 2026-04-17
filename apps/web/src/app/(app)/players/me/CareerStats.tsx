import type { JSX } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  derivePitchingStats,
  deriveBattingStats,
  formatInningsPitched,
  formatBattingRate,
  formatBattingPct,
} from '@baseball/shared';
import type { PitchingStats, BattingStats } from '@baseball/shared';
import { getCareerEventsForUser, getPlayerIdsForUser } from '@baseball/database';

interface Props {
  userId: string;
  firstName: string;
  lastName: string;
}

/**
 * Combines events for every player_id this user owns by remapping each
 * event's player_id / pitcher_id to a single canonical id, then running
 * the shared stat derivations once. This gives aggregated career totals
 * without needing to hand-merge two stat objects.
 */
export async function CareerStats({ userId, firstName, lastName }: Props): Promise<JSX.Element> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return <div className="text-sm text-gray-400">Stats unavailable.</div>;
  }
  // Service role is used here because career stats aggregate across every
  // team this user has played for — RLS on game_events is scoped per-team
  // and wouldn't return cross-team rows. Callers must have already
  // authorized the request (owner dashboard checks auth.getUser; public
  // page checks is_player_pro and is_public).
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const [rows, playerIds] = await Promise.all([
    getCareerEventsForUser(db, userId),
    getPlayerIdsForUser(db, userId),
  ]);

  if (rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl px-5 py-8 text-center text-gray-500">
        <p className="text-sm">No career stats yet.</p>
        <p className="text-xs text-gray-400 mt-1">
          Once you&apos;re on a roster and games get scored, stats will appear here.
        </p>
      </div>
    );
  }

  const playerIdSet = new Set(playerIds);

  const { career, seasons } = computeStats(rows, playerIdSet, firstName, lastName);

  return (
    <div className="space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Career totals
        </h3>
        <div className="space-y-4">
          {career.batting && <BattingGrid stats={career.batting} />}
          {career.pitching && <PitchingGrid stats={career.pitching} />}
          {!career.batting && !career.pitching && (
            <div className="text-sm text-gray-400">No stats recorded yet.</div>
          )}
        </div>
      </section>

      {seasons.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            By season
          </h3>
          <div className="space-y-6">
            {seasons.map((s) => (
              <div key={s.key} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-baseline mb-3">
                  <p className="text-sm font-semibold text-gray-900">{s.teamName}</p>
                  <p className="text-xs text-gray-500">{s.seasonName}</p>
                </div>
                {s.batting && <BattingGrid stats={s.batting} />}
                {s.pitching && <div className="mt-3"><PitchingGrid stats={s.pitching} /></div>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const CANONICAL_ID = '00000000-0000-0000-0000-000000000001';

type CareerEventRow = {
  event: Record<string, unknown>;
  gameId: string;
  seasonId: string | null;
  seasonName: string | null;
  teamId: string | null;
  teamName: string | null;
  gameDate: string | null;
};

function remapEvents(
  events: Record<string, unknown>[],
  playerIds: Set<string>,
): Record<string, unknown>[] {
  return events.map((e) => {
    const out = { ...e };
    const playerId = out.player_id as string | null | undefined;
    const pitcherId = out.pitcher_id as string | null | undefined;
    if (playerId && playerIds.has(playerId)) out.player_id = CANONICAL_ID;
    if (pitcherId && playerIds.has(pitcherId)) out.pitcher_id = CANONICAL_ID;
    return out;
  });
}

function runDerivations(
  events: Record<string, unknown>[],
  firstName: string,
  lastName: string,
): { batting: BattingStats | null; pitching: PitchingStats | null } {
  const list = [{ id: CANONICAL_ID, firstName, lastName }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const batting = deriveBattingStats(events as any, list).get(CANONICAL_ID) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pitching = derivePitchingStats(events as any, list).get(CANONICAL_ID) ?? null;

  return {
    batting: batting && batting.plateAppearances > 0 ? batting : null,
    pitching: pitching && pitching.totalPAs > 0 ? pitching : null,
  };
}

function computeStats(
  rows: CareerEventRow[],
  playerIds: Set<string>,
  firstName: string,
  lastName: string,
) {
  const remappedAll = remapEvents(
    rows.map((r) => r.event),
    playerIds,
  );
  const career = runDerivations(remappedAll, firstName, lastName);

  const groupMap = new Map<
    string,
    {
      key: string;
      seasonName: string;
      teamName: string;
      events: Record<string, unknown>[];
      latestGameDate: string | null;
    }
  >();
  for (const r of rows) {
    const key = `${r.seasonId ?? 'none'}::${r.teamId ?? 'none'}`;
    const existing = groupMap.get(key);
    if (!existing) {
      groupMap.set(key, {
        key,
        seasonName: r.seasonName ?? 'Unlabeled season',
        teamName: r.teamName ?? 'Unknown team',
        events: [r.event],
        latestGameDate: r.gameDate,
      });
    } else {
      existing.events.push(r.event);
      if (r.gameDate && (!existing.latestGameDate || r.gameDate > existing.latestGameDate)) {
        existing.latestGameDate = r.gameDate;
      }
    }
  }

  const seasons = [...groupMap.values()]
    .map((g) => {
      const remapped = remapEvents(g.events, playerIds);
      const stats = runDerivations(remapped, firstName, lastName);
      return { ...g, ...stats };
    })
    .filter((g) => g.batting || g.pitching)
    .sort((a, b) => {
      // Most recent season first. Groups without a known date sort last.
      if (!a.latestGameDate && !b.latestGameDate) return 0;
      if (!a.latestGameDate) return 1;
      if (!b.latestGameDate) return -1;
      return b.latestGameDate.localeCompare(a.latestGameDate);
    });

  return { career, seasons };
}

// ---------------------------------------------------------------------------

function BattingGrid({ stats }: { stats: BattingStats }): JSX.Element {
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
      {[
        { label: 'AVG', value: formatBattingRate(stats.avg) },
        { label: 'OBP', value: formatBattingRate(stats.obp) },
        { label: 'SLG', value: formatBattingRate(stats.slg) },
        { label: 'OPS', value: formatBattingRate(stats.ops) },
        { label: 'G', value: stats.gamesAppeared.toString() },
        { label: 'PA', value: stats.plateAppearances.toString() },
        { label: 'AB', value: stats.atBats.toString() },
        { label: 'H', value: stats.hits.toString() },
        { label: '2B', value: stats.doubles.toString() },
        { label: '3B', value: stats.triples.toString() },
        { label: 'HR', value: stats.homeRuns.toString() },
        { label: 'RBI', value: stats.rbi.toString() },
        { label: 'BB', value: stats.walks.toString() },
        { label: 'K', value: stats.strikeouts.toString() },
        { label: 'K%', value: formatBattingPct(stats.kPct) },
        { label: 'wOBA', value: formatBattingRate(stats.woba) },
      ].map(({ label, value }) => (
        <div key={label} className="bg-white border border-gray-200 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
          <p className="text-sm font-bold text-gray-900 tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

function PitchingGrid({ stats }: { stats: PitchingStats }): JSX.Element {
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
      {[
        { label: 'IP', value: formatInningsPitched(stats.inningsPitchedOuts) },
        { label: 'ERA', value: isFinite(stats.era) ? stats.era.toFixed(2) : '—' },
        { label: 'WHIP', value: isFinite(stats.whip) ? stats.whip.toFixed(2) : '—' },
        { label: 'K', value: stats.strikeouts.toString() },
        { label: 'BB', value: stats.walksAllowed.toString() },
        { label: 'H', value: stats.hitsAllowed.toString() },
        { label: 'PC', value: stats.totalPitches.toString() },
        { label: 'STR%', value: `${(stats.strikePercentage * 100).toFixed(0)}%` },
      ].map(({ label, value }) => (
        <div key={label} className="bg-white border border-gray-200 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">{label}</p>
          <p className="text-sm font-bold text-gray-900 tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}
