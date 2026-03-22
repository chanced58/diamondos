import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { deriveBattingStats, derivePitchingStats } from '@baseball/shared';
import type { BattingStats, PitchingStats } from '@baseball/shared';
import { GameStatsClient } from './GameStatsClient';
import type { FieldingStatRow, LineScoreData, OppBattingRow } from './GameStatsClient';

export const metadata: Metadata = { title: 'Game Stats' };

const DB_TO_POSITION: Record<string, string> = {
  pitcher: 'P', catcher: 'C', first_base: '1B', second_base: '2B',
  third_base: '3B', shortstop: 'SS', left_field: 'LF', center_field: 'CF',
  right_field: 'RF', designated_hitter: 'DH', infield: 'IF', outfield: 'OF',
  utility: 'UTIL',
};

// Position abbreviation → standard defensive position number
const ABBR_TO_NUM: Record<string, number> = {
  P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function applyPitchReverted(events: Record<string, unknown>[]): Record<string, unknown>[] {
  // Mirrors the effectiveEventRows logic in ScoringBoard: each pitch_reverted event
  // trims the list back to sequence numbers <= revertToSequenceNumber.
  const result: Record<string, unknown>[] = [];
  for (const event of events) {
    if ((event.event_type as string) === 'pitch_reverted') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const keepUntilSeq = payload.revertToSequenceNumber as number;
      result.splice(0, result.length, ...result.filter((e) => (e.sequence_number as number) <= keepUntilSeq));
      // pitch_reverted marker itself is not added
    } else {
      result.push(event);
    }
  }
  return result;
}

function computeLineScore(events: Record<string, unknown>[]): LineScoreData {
  let isTopOfInning = true;
  let currentInning = 1;

  const awayRunsByInning: number[] = [0];
  const homeRunsByInning: number[] = [0];
  let awayRuns = 0, homeRuns = 0;
  let awayHits = 0, homeHits = 0;
  let awayErrors = 0, homeErrors = 0;

  for (const event of events) {
    const etype = event.event_type as string;
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    if (etype === 'inning_change') {
      if (isTopOfInning) {
        isTopOfInning = false;
      } else {
        isTopOfInning = true;
        currentInning++;
        if (awayRunsByInning.length < currentInning) awayRunsByInning.push(0);
        if (homeRunsByInning.length < currentInning) homeRunsByInning.push(0);
      }
    } else if (etype === 'score') {
      const rbis = (payload.rbis as number) ?? 1;
      if (isTopOfInning) {
        awayRunsByInning[currentInning - 1] = (awayRunsByInning[currentInning - 1] ?? 0) + rbis;
        awayRuns += rbis;
      } else {
        homeRunsByInning[currentInning - 1] = (homeRunsByInning[currentInning - 1] ?? 0) + rbis;
        homeRuns += rbis;
      }
    } else if (etype === 'hit') {
      if (isTopOfInning) awayHits++;
      else homeHits++;
    } else if (etype === 'field_error') {
      // Error is charged to the FIELDING team (defense), not the batting team
      if (isTopOfInning) homeErrors++;
      else awayErrors++;
    }
  }

  // Pad arrays to equal length
  const maxLen = Math.max(awayRunsByInning.length, homeRunsByInning.length);
  while (awayRunsByInning.length < maxLen) awayRunsByInning.push(0);
  while (homeRunsByInning.length < maxLen) homeRunsByInning.push(0);

  return {
    awayRunsByInning, homeRunsByInning,
    awayRuns, homeRuns,
    awayHits, homeHits,
    awayErrors, homeErrors,
  };
}

type LineupEntry = {
  playerId: string;
  battingOrder: number;
  startingPosition: string | null;
  player: { id: string | null; firstName: string; lastName: string; jerseyNumber: number | null };
};

function computeFieldingStats(
  events: Record<string, unknown>[],
  teamLineup: LineupEntry[],
  locationType: string,
  playerNameMap: Map<string, { name: string; position: string }>,
  forOpponent = false,
): FieldingStatRow[] {
  // Position number → playerId for this team's defensive lineup
  const posToPlayer = new Map<number, string>();

  for (const entry of teamLineup) {
    if (entry.startingPosition) {
      const num = ABBR_TO_NUM[entry.startingPosition];
      if (num) posToPlayer.set(num, entry.playerId);
    }
  }

  const stats = new Map<string, FieldingStatRow>();

  function getRow(playerId: string): FieldingStatRow {
    if (!stats.has(playerId)) {
      const info = playerNameMap.get(playerId);
      stats.set(playerId, {
        playerId,
        playerName: info?.name ?? 'Unknown',
        position: info?.position ?? '',
        putouts: 0, assists: 0, errors: 0,
      });
    }
    return stats.get(playerId)!;
  }

  let isTopOfInning = true;

  for (const event of events) {
    const etype = event.event_type as string;
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    if (etype === 'inning_change') {
      isTopOfInning = !isTopOfInning;
      continue;
    }

    if (etype === 'pitching_change') {
      const isOppChange = payload.isOpponentChange as boolean | undefined;
      // Track this team's pitching changes: our team = !isOppChange, opponent = isOppChange
      if (forOpponent ? !!isOppChange : !isOppChange) {
        const newId = payload.newPitcherId as string | undefined;
        if (newId) posToPlayer.set(1, newId);
      }
      continue;
    }

    if (etype === 'substitution') {
      const isOppSub = payload.isOpponentSubstitution as boolean | undefined;
      if (forOpponent ? !!isOppSub : !isOppSub) {
        const inId = payload.inPlayerId as string | undefined;
        const outId = payload.outPlayerId as string | undefined;
        const newPos = payload.newPosition as string | undefined;
        if (inId && newPos && ABBR_TO_NUM[newPos]) {
          posToPlayer.set(ABBR_TO_NUM[newPos], inId);
        } else if (inId && outId) {
          for (const [num, pid] of posToPlayer.entries()) {
            if (pid === outId) { posToPlayer.set(num, inId); break; }
          }
        }
      }
      continue;
    }

    // Home team fields in top half; away team fields in bottom half.
    const weAreHome = locationType === 'home';
    const teamIsFielding = forOpponent
      ? (weAreHome ? !isTopOfInning : isTopOfInning)
      : (weAreHome ? isTopOfInning : !isTopOfInning);
    if (!teamIsFielding) continue;

    if (
      etype === 'out' || etype === 'double_play' || etype === 'triple_play' ||
      etype === 'sacrifice_fly' || etype === 'sacrifice_bunt'
    ) {
      const seq = payload.fieldingSequence as number[] | undefined;
      if (seq && seq.length > 0) {
        for (let i = 0; i < seq.length; i++) {
          const playerId = posToPlayer.get(seq[i]);
          if (!playerId) continue;
          if (i === seq.length - 1) getRow(playerId).putouts++;
          else getRow(playerId).assists++;
        }
      }
    }

    if (etype === 'field_error') {
      const errorBy = payload.errorBy as number | undefined;
      if (errorBy !== undefined) {
        const playerId = posToPlayer.get(errorBy);
        if (playerId) getRow(playerId).errors++;
      }
    }

    if (etype === 'caught_stealing') {
      // Catcher typically gets the putout; add one if catcher is identified
      const catcherId = posToPlayer.get(2);
      if (catcherId) getRow(catcherId).putouts++;
    }

    if (etype === 'strikeout') {
      // Catcher gets PO on strikeout (if no SB/passed ball during the strikeout)
      const catcherId = posToPlayer.get(2);
      if (catcherId) getRow(catcherId).putouts++;
    }
  }

  return Array.from(stats.values());
}

function computeOpponentBatting(
  events: Record<string, unknown>[],
  oppPlayerNameMap: Map<string, string>,
): OppBattingRow[] {
  const stats = new Map<string, OppBattingRow>();

  function get(id: string): OppBattingRow {
    if (!stats.has(id)) {
      stats.set(id, {
        playerId: id,
        playerName: oppPlayerNameMap.get(id) ?? 'Unknown',
        pa: 0, ab: 0, r: 0, h: 0,
        doubles: 0, triples: 0, hr: 0,
        rbi: 0, bb: 0, k: 0,
        hbp: 0, sf: 0, sh: 0,
        sb: 0, cs: 0,
        avg: NaN, obp: NaN, slg: NaN, ops: NaN,
      });
    }
    return stats.get(id)!;
  }

  for (const event of events) {
    const etype = event.event_type as string;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const batterId = payload.opponentBatterId as string | undefined;

    if (!batterId) {
      if (etype === 'score') {
        const scoringId = payload.scoringPlayerId as string | undefined;
        const isOpp = payload.isOpponentScore as boolean | undefined;
        if (scoringId && isOpp && oppPlayerNameMap.has(scoringId)) {
          get(scoringId).r++;
        }
      }
      if (etype === 'stolen_base' || etype === 'caught_stealing') {
        const runnerId = payload.runnerId as string | undefined;
        if (runnerId && oppPlayerNameMap.has(runnerId)) {
          if (etype === 'stolen_base') get(runnerId).sb++;
          else get(runnerId).cs++;
        }
      }
      continue;
    }

    if (etype === 'hit') {
      const s = get(batterId);
      s.pa++; s.ab++; s.h++;
      s.rbi += (payload.rbis as number) ?? 0;
      const hitType = payload.hitType as string;
      if (hitType === 'double') s.doubles++;
      else if (hitType === 'triple') s.triples++;
      else if (hitType === 'home_run') s.hr++;
    } else if (etype === 'out' || etype === 'double_play' || etype === 'triple_play') {
      const s = get(batterId);
      s.pa++; s.ab++;
    } else if (etype === 'strikeout') {
      const s = get(batterId);
      s.pa++; s.ab++; s.k++;
    } else if (etype === 'walk') {
      const s = get(batterId);
      s.pa++; s.bb++;
    } else if (etype === 'hit_by_pitch') {
      const s = get(batterId);
      s.pa++; s.hbp++;
    } else if (etype === 'sacrifice_fly') {
      const s = get(batterId);
      s.pa++; s.sf++;
    } else if (etype === 'sacrifice_bunt') {
      const s = get(batterId);
      s.pa++; s.sh++;
    } else if (etype === 'field_error') {
      const s = get(batterId);
      s.pa++; s.ab++;
    }
  }

  for (const s of stats.values()) {
    s.avg = s.ab > 0 ? s.h / s.ab : NaN;
    const obpDenom = s.ab + s.bb + s.hbp + s.sf;
    s.obp = obpDenom > 0 ? (s.h + s.bb + s.hbp) / obpDenom : NaN;
    const singles = s.h - s.doubles - s.triples - s.hr;
    const tb = singles + 2 * s.doubles + 3 * s.triples + 4 * s.hr;
    s.slg = s.ab > 0 ? tb / s.ab : NaN;
    s.ops = (isFinite(s.obp) ? s.obp : 0) + (isFinite(s.slg) ? s.slg : 0);
    if (!isFinite(s.obp) && !isFinite(s.slg)) s.ops = NaN;
  }

  return Array.from(stats.values());
}

function computeBaserunningStats(
  events: Record<string, unknown>[],
  ourPlayerIds: Set<string>,
): Record<string, { sb: number; cs: number }> {
  const result: Record<string, { sb: number; cs: number }> = {};
  for (const event of events) {
    const etype = event.event_type as string;
    if (etype !== 'stolen_base' && etype !== 'caught_stealing') continue;
    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const runnerId = payload.runnerId as string | undefined;
    if (!runnerId || !ourPlayerIds.has(runnerId)) continue;
    if (!result[runnerId]) result[runnerId] = { sb: 0, cs: 0 };
    if (etype === 'stolen_base') result[runnerId].sb++;
    else result[runnerId].cs++;
  }
  return result;
}


// ── Page ─────────────────────────────────────────────────────────────────────

export default async function GameStatsPage({
  params,
}: {
  params: { gameId: string };
}): Promise<JSX.Element | null> {
  const auth = createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: game } = await db
    .from('games')
    .select('id, team_id, opponent_name, location_type, status, home_score, away_score, season_id, opponent_team_id')
    .eq('id', params.gameId)
    .single();

  if (!game) notFound();

  const { isCoach, isPlatformAdmin } = await getUserAccess(game.team_id, user.id);

  if (!isCoach && !isPlatformAdmin) {
    const { data: membership } = await db
      .from('team_members')
      .select('role')
      .eq('team_id', game.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();
    if (!membership) notFound();
  }

  // Only show stats for games that have been started (in_progress or completed)
  if (['scheduled', 'cancelled', 'postponed'].includes(game.status)) {
    return (
      <div className="p-8 max-w-2xl">
        <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
          ← Back to game
        </Link>
        <p className="mt-6 text-gray-500">Stats are available once the game has started.</p>
      </div>
    );
  }

  const [lineupResult, eventsResult, rosterResult, teamResult, opponentPlayersResult, opponentLineupResult] =
    await Promise.all([
      db
        .from('game_lineups')
        .select('player_id, batting_order, starting_position, players(id, first_name, last_name, jersey_number)')
        .eq('game_id', params.gameId)
        .order('batting_order', { ascending: true, nullsFirst: false }),
      db
        .from('game_events')
        .select('*')
        .eq('game_id', params.gameId)
        .order('sequence_number'),
      // Fetch ALL players (not just active) so deactivated players who
      // participated in this game still resolve their names in stats.
      db
        .from('players')
        .select('id, first_name, last_name, jersey_number')
        .eq('team_id', game.team_id)
        .order('last_name'),
      db.from('teams').select('*').eq('id', game.team_id).single(),
      game.opponent_team_id
        ? db
            .from('opponent_players')
            .select('id, first_name, last_name, jersey_number')
            .eq('opponent_team_id', game.opponent_team_id)
            .order('last_name')
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string; jersey_number: string | null }[] }),
      game.opponent_team_id
        ? db
            .from('opponent_game_lineups')
            .select('opponent_player_id, batting_order, starting_position, opponent_players(id, first_name, last_name, jersey_number)')
            .eq('game_id', params.gameId)
            .order('batting_order', { ascending: true, nullsFirst: false })
        : Promise.resolve({ data: [] as { opponent_player_id: string; batting_order: number | null; starting_position: string | null; opponent_players: unknown }[] }),
    ]);

  const teamName = teamResult.data?.name ?? 'Our Team';

  const lineup: LineupEntry[] = (lineupResult.data ?? []).map((l) => {
    const p = l.players as unknown as { id: string; first_name: string; last_name: string; jersey_number: number | null } | null;
    return {
      playerId: l.player_id as string,
      battingOrder: (l.batting_order as number | null) ?? 0,
      startingPosition: l.starting_position ? (DB_TO_POSITION[l.starting_position] ?? l.starting_position) : null,
      player: {
        id: p?.id ?? null,
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        jerseyNumber: p?.jersey_number ?? null,
      },
    };
  });

  const opponentLineup: LineupEntry[] = (opponentLineupResult.data ?? []).map((l) => {
    const p = l.opponent_players as unknown as { id: string; first_name: string; last_name: string; jersey_number: string | null } | null;
    return {
      playerId: l.opponent_player_id as string,
      battingOrder: (l.batting_order as number | null) ?? 0,
      startingPosition: l.starting_position ? (DB_TO_POSITION[l.starting_position] ?? l.starting_position) : null,
      player: {
        id: p?.id ?? null,
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        jerseyNumber: typeof p?.jersey_number === 'string' ? parseInt(p.jersey_number, 10) || null : (p?.jersey_number ?? null),
      },
    };
  });

  const teamRoster = (rosterResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number ?? null,
  }));

  const opponentRoster = (opponentPlayersResult.data ?? []).map((p) => ({
    id: p.id,
    firstName: p.first_name,
    lastName: p.last_name,
    jerseyNumber: p.jersey_number ?? null,
  }));

  // ── Filter out reverted events ──────────────────────────────────────────────
  const allEvents = (eventsResult.data ?? []) as Record<string, unknown>[];
  // Find most recent game_start (skip game_reset boundary)
  const lastResetIndex = allEvents.map((e) => e.event_type).lastIndexOf('game_reset');
  const activeEvents = lastResetIndex === -1 ? allEvents : allEvents.slice(lastResetIndex + 1);
  const effectiveEvents = applyPitchReverted(activeEvents);

  // ── Batting stats (our team) ────────────────────────────────────────────────
  // deriveBattingStats uses batterId (our team's players); opponent uses opponentBatterId
  const ourPlayers = teamRoster.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
  }));

  // Fallback IDs used by ScoringBoard when a player slot is empty
  const FALLBACK_IDS = new Set(['unknown-batter', 'unknown-pitcher']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ourBattingMap = deriveBattingStats(effectiveEvents as any, ourPlayers);
  const ourBatting: BattingStats[] = Array.from(ourBattingMap.values())
    .filter((s) => s.plateAppearances > 0 && !FALLBACK_IDS.has(s.playerId));

  // ── Pitching stats (both teams) ─────────────────────────────────────────────
  const allPlayersForPitching = [
    ...teamRoster.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
    ...opponentRoster.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPitchingMap = derivePitchingStats(effectiveEvents as any, allPlayersForPitching);

  const ourPlayerIds = new Set(teamRoster.map((p) => p.id));
  const oppPlayerIds = new Set(opponentRoster.map((p) => p.id));

  const ourPitching: PitchingStats[] = Array.from(allPitchingMap.values())
    .filter((s) => ourPlayerIds.has(s.playerId) && s.totalPitches > 0 && !FALLBACK_IDS.has(s.playerId));
  const oppPitching: PitchingStats[] = Array.from(allPitchingMap.values())
    .filter((s) => oppPlayerIds.has(s.playerId) && s.totalPitches > 0 && !FALLBACK_IDS.has(s.playerId));

  // ── Opponent batting (simplified) ───────────────────────────────────────────
  const oppPlayerNameMap = new Map(opponentRoster.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  // Also include opponent players from lineup that may not be in roster
  for (const entry of opponentLineup) {
    if (!oppPlayerNameMap.has(entry.playerId)) {
      oppPlayerNameMap.set(entry.playerId, `${entry.player.firstName} ${entry.player.lastName}`);
    }
  }
  const oppBatting = computeOpponentBatting(effectiveEvents, oppPlayerNameMap)
    .filter((s) => !FALLBACK_IDS.has(s.playerId));

  // ── Fielding stats (our team) ───────────────────────────────────────────────
  const ourPlayerNameMap = new Map<string, { name: string; position: string }>();
  for (const entry of lineup) {
    ourPlayerNameMap.set(entry.playerId, {
      name: `${entry.player.firstName} ${entry.player.lastName}`,
      position: entry.startingPosition ?? '',
    });
  }
  for (const p of teamRoster) {
    if (!ourPlayerNameMap.has(p.id)) {
      ourPlayerNameMap.set(p.id, { name: `${p.firstName} ${p.lastName}`, position: '' });
    }
  }

  const ourFielding = computeFieldingStats(
    effectiveEvents,
    lineup,
    game.location_type,
    ourPlayerNameMap,
  );

  // ── Fielding stats (opponent) ─────────────────────────────────────────────
  const oppFieldingNameMap = new Map<string, { name: string; position: string }>();
  for (const entry of opponentLineup) {
    oppFieldingNameMap.set(entry.playerId, {
      name: `${entry.player.firstName} ${entry.player.lastName}`,
      position: entry.startingPosition ?? '',
    });
  }
  for (const p of opponentRoster) {
    if (!oppFieldingNameMap.has(p.id)) {
      oppFieldingNameMap.set(p.id, { name: `${p.firstName} ${p.lastName}`, position: '' });
    }
  }

  const oppFielding = computeFieldingStats(
    effectiveEvents,
    opponentLineup,
    game.location_type,
    oppFieldingNameMap,
    true, // forOpponent
  );

  // ── Baserunning stats (our team) ────────────────────────────────────────────
  const baserunning = computeBaserunningStats(effectiveEvents, ourPlayerIds);

  // ── Line score ──────────────────────────────────────────────────────────────
  const lineScore = computeLineScore(effectiveEvents);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-200 bg-white">
        <Link href={`/games/${params.gameId}`} className="text-sm text-brand-700 hover:underline">
          ← Back to game
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-lg font-bold text-gray-900">
            {teamName} vs {game.opponent_name}
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-900">
              {game.location_type === 'home'
                ? `${lineScore.homeRuns} – ${lineScore.awayRuns}`
                : `${lineScore.awayRuns} – ${lineScore.homeRuns}`}
            </span>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              game.status === 'completed'
                ? 'bg-gray-100 text-gray-600'
                : 'bg-green-100 text-green-700'
            }`}>
              {game.status === 'completed' ? 'Final' : 'Live'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats client */}
      <div className="flex-1 overflow-auto">
        <GameStatsClient
          game={{
            id: game.id,
            opponentName: game.opponent_name,
            locationType: game.location_type,
            status: game.status,
            teamName,
          }}
          ourBatting={ourBatting}
          oppBatting={oppBatting}
          ourPitching={ourPitching}
          oppPitching={oppPitching}
          ourFielding={ourFielding}
          oppFielding={oppFielding}
          lineScore={lineScore}
          baserunning={baserunning}
        />
      </div>
    </div>
  );
}
