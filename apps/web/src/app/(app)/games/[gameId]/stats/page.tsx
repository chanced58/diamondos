import type { JSX } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { deriveBattingStats, derivePitchingStats, weAreHome, computeOpponentBatting, applyPitchReverted } from '@baseball/shared';
import type { BattingStats, PitchingStats } from '@baseball/shared';
import { GameStatsClient } from './GameStatsClient';
import type { FieldingStatRow, LineScoreData } from './GameStatsClient';

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

function hitBases(hitType: string): number {
  switch (hitType) {
    case 'single': return 1;
    case 'double': return 2;
    case 'triple': return 3;
    case 'home_run': return 4;
    default: return 1;
  }
}

function computeLineScore(events: Record<string, unknown>[]): LineScoreData {
  let isTopOfInning = true;
  let currentInning = 1;

  // Track base runners by ID so we can match runnerId from out events
  let first: string | null = null, second: string | null = null, third: string | null = null;

  const awayRunsByInning: number[] = [0];
  const homeRunsByInning: number[] = [0];
  let awayRuns = 0, homeRuns = 0;
  let awayHits = 0, homeHits = 0;
  let awayErrors = 0, homeErrors = 0;

  function scoreRun(count: number) {
    if (count <= 0) return;
    if (isTopOfInning) {
      awayRunsByInning[currentInning - 1] = (awayRunsByInning[currentInning - 1] ?? 0) + count;
      awayRuns += count;
    } else {
      homeRunsByInning[currentInning - 1] = (homeRunsByInning[currentInning - 1] ?? 0) + count;
      homeRuns += count;
    }
  }

  function forceAdvance(batterId: string) {
    // Bases-loaded force: runner on 3rd scores
    if (first && second && third) {
      scoreRun(1);
      // third scores, everyone shifts up, batter to first
      third = second; second = first; first = batterId;
    } else if (first && second) {
      third = second; second = first; first = batterId;
    } else if (first) {
      second = first; first = batterId;
    } else {
      first = batterId;
    }
  }

  function clearBases() {
    first = null; second = null; third = null;
  }

  // Remove a runner by ID from whichever base they occupy
  function removeRunner(runnerId: string) {
    if (first === runnerId) first = null;
    else if (second === runnerId) second = null;
    else if (third === runnerId) third = null;
  }

  // Clear runner at a specific base number
  function clearBase(base: number) {
    if (base === 1) first = null;
    else if (base === 2) second = null;
    else if (base === 3) third = null;
  }

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
      clearBases();
    } else if (etype === 'hit') {
      if (isTopOfInning) awayHits++;
      else homeHits++;

      const batterId = (payload.batterId ?? payload.opponentBatterId ?? 'unknown') as string;
      const bases = hitBases(payload.hitType as string);
      if (bases === 4) {
        // Home run: everyone scores
        let runners = 0;
        if (first) runners++;
        if (second) runners++;
        if (third) runners++;
        scoreRun(runners + 1);
        clearBases();
      } else {
        // Count runners who score: runner scores if their base + hit bases >= 4
        let runs = 0;
        if (third) runs++;                           // 3 + any hit >= 4
        if (second && 2 + bases >= 4) runs++;        // double or triple
        if (first && 1 + bases >= 4) runs++;         // triple only
        scoreRun(runs);
        // Simplified base advancement
        const newFirst = bases === 1 ? batterId : null;
        const newSecond = bases === 2 ? batterId : (bases === 1 && first) ? first : null;
        const newThird = bases === 3 ? batterId
          : (bases === 2 && second) ? second
          : (bases === 2 && first) ? first
          : (bases === 1 && second) ? second
          : null;
        first = newFirst; second = newSecond; third = newThird;
      }
    } else if (etype === 'walk' || etype === 'hit_by_pitch') {
      const batterId = (payload.batterId ?? payload.opponentBatterId ?? 'unknown') as string;
      forceAdvance(batterId);
    } else if (etype === 'field_error') {
      if (isTopOfInning) homeErrors++;
      else awayErrors++;
      const batterId = (payload.batterId ?? payload.opponentBatterId ?? 'unknown') as string;
      forceAdvance(batterId);
    } else if (etype === 'score') {
      // Explicit score events (stolen home, runner advance, balk) — always 1 run per event
      scoreRun(1);
    } else if (etype === 'sacrifice_fly' || etype === 'sacrifice_bunt') {
      // Sac fly typically scores runner from 3rd
      if (etype === 'sacrifice_fly' && third) {
        scoreRun(1);
        third = null;
      }
    } else if (etype === 'stolen_base') {
      const toBase = payload.toBase as number | undefined;
      const runnerId = payload.runnerId as string | undefined;
      if (toBase === 4 && third) {
        // Stolen home — already counted via separate 'score' event
        third = null;
      } else if (toBase === 3 && second) {
        third = second; second = null;
      } else if (toBase === 2 && first) {
        second = first; first = null;
      }
      // If we have a runnerId, ensure old base is cleared for non-standard advances
      if (runnerId) {
        const fromBase = payload.fromBase as number | undefined;
        if (fromBase === 1 && first === runnerId) first = null;
        else if (fromBase === 2 && second === runnerId) second = null;
        else if (fromBase === 3 && third === runnerId) third = null;
      }
    } else if (etype === 'caught_stealing') {
      const fromBase = payload.fromBase as number | undefined;
      if (fromBase === 3) third = null;
      else if (fromBase === 2) second = null;
      else if (fromBase === 1) first = null;
    } else if (etype === 'baserunner_advance') {
      const toBase = payload.toBase as number | undefined;
      const fromBase = payload.fromBase as number | undefined;
      const runnerId = payload.runnerId as string | undefined;
      if (toBase === 4) {
        // Runner scored — already counted via separate 'score' event
        if (fromBase === 3) third = null;
        else if (fromBase === 2) second = null;
        else if (fromBase === 1) first = null;
      } else {
        if (fromBase === 1) { first = null; if (toBase === 2) second = runnerId ?? 'unknown'; else if (toBase === 3) third = runnerId ?? 'unknown'; }
        if (fromBase === 2) { second = null; if (toBase === 3) third = runnerId ?? 'unknown'; }
      }
    } else if (etype === 'baserunner_out') {
      // Fielder's choice — runner called out while batter reaches
      const runnerId = payload.runnerId as string | undefined;
      if (runnerId) removeRunner(runnerId);
    } else if (etype === 'pickoff_attempt') {
      const outcome = payload.outcome as string | undefined;
      if (outcome === 'out') {
        const base = payload.base as number | undefined;
        if (base) clearBase(base);
      }
    } else if (etype === 'rundown') {
      const startBase = payload.startBase as number | undefined;
      const outcome = payload.outcome as string | undefined;
      const runnerId = payload.runnerId as string | undefined;
      if (startBase) clearBase(startBase);
      if (outcome === 'safe') {
        const safeAtBase = payload.safeAtBase as number | undefined;
        if (safeAtBase === 1) first = runnerId ?? 'unknown';
        else if (safeAtBase === 2) second = runnerId ?? 'unknown';
        else if (safeAtBase === 3) third = runnerId ?? 'unknown';
      }
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
  isHome: boolean,
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
    const teamIsFielding = forOpponent
      ? (isHome ? !isTopOfInning : isTopOfInning)
      : (isHome ? isTopOfInning : !isTopOfInning);
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
    .select('id, team_id, opponent_name, location_type, neutral_home_team, status, home_score, away_score, season_id, opponent_team_id')
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

  const ourPlayerIds = new Set(teamRoster.map((p) => p.id));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ourBattingMap = deriveBattingStats(effectiveEvents as any, ourPlayers);
  const ourBatting: BattingStats[] = Array.from(ourBattingMap.values())
    .filter((s) => s.plateAppearances > 0 && ourPlayerIds.has(s.playerId));

  // ── Pitching stats (both teams) ─────────────────────────────────────────────
  const allPlayersForPitching = [
    ...teamRoster.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
    ...opponentRoster.map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPitchingMap = derivePitchingStats(effectiveEvents as any, allPlayersForPitching);

  const oppPlayerIds = new Set(opponentRoster.map((p) => p.id));

  const ourPitching: PitchingStats[] = Array.from(allPitchingMap.values())
    .filter((s) => ourPlayerIds.has(s.playerId) && s.totalPitches > 0);
  const oppPitching: PitchingStats[] = Array.from(allPitchingMap.values())
    .filter((s) => oppPlayerIds.has(s.playerId) && s.totalPitches > 0);

  // ── Opponent batting (simplified) ───────────────────────────────────────────
  const oppPlayerNameMap = new Map(opponentRoster.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
  // Also include opponent players from lineup that may not be in roster
  for (const entry of opponentLineup) {
    if (!oppPlayerNameMap.has(entry.playerId)) {
      oppPlayerNameMap.set(entry.playerId, `${entry.player.firstName} ${entry.player.lastName}`);
    }
  }
  const oppBatting = computeOpponentBatting(effectiveEvents, oppPlayerNameMap);

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

  const isHome = weAreHome(game.location_type, game.neutral_home_team);

  const ourFielding = computeFieldingStats(
    effectiveEvents,
    lineup,
    isHome,
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
    isHome,
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
              {isHome
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
            neutralHomeTeam: game.neutral_home_team,
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
