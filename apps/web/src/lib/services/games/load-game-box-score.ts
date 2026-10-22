import type { SupabaseClient } from '@supabase/supabase-js';
import {
  gameIdInputSchema,
  type BattingStats,
  type BoxScoreBatter,
  type BoxScoreFielder,
  type BoxScorePitcher,
  type GameBoxScoreResponse,
  type OppBattingRow,
  type PitchingStats,
} from '@baseball/shared';
import { loadGameStats, type GameStatsBundle } from '@/lib/game-stats/load-game-stats';
import type { FieldingStatRow } from '@/lib/game-stats/derive';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from './authorize';

/**
 * A game's box score for the mobile stats screen: the same stats the web
 * stats page shows (one shared loader), visible to the same people — active
 * team members and platform admins — once the game has started.
 */
export async function loadGameBoxScore(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<GameBoxScoreResponse>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  // A light read authorizes before the expensive stat load.
  const { data: meta, error: metaError } = await db.from('games').select('team_id, status').eq('id', gameId).maybeSingle();
  if (metaError) {
    console.error(`[loadGameBoxScore] game=${gameId} actor=${actorUserId} game read failed:`, metaError);
    return serviceError('failed', 'Failed to load the box score.');
  }
  if (!meta) return serviceError('not_found', 'Game not found.');

  const viewer = await resolveGameViewer(db, actorUserId, meta.team_id as string);
  if (!viewer) return serviceError('not_found', 'Game not found.');

  if (meta.status !== 'in_progress' && meta.status !== 'completed') {
    return serviceError('conflict', 'Stats are available once the game has started.');
  }

  const bundle = await loadGameStats(db, gameId);
  if (!bundle) return serviceError('not_found', 'Game not found.');

  return serviceOk(toBoxScore(bundle, viewer.isCoach));
}

/** A rate the client can format: non-finite (no PAs, no outs) becomes null. */
function finite(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) ? value : null;
}

function ourBatter(s: BattingStats, baserunning: GameStatsBundle['baserunning']): BoxScoreBatter {
  return {
    playerId: s.playerId,
    name: s.playerName,
    ab: s.atBats,
    r: s.runs,
    h: s.hits,
    doubles: s.doubles,
    triples: s.triples,
    hr: s.homeRuns,
    rbi: s.rbi,
    bb: s.walks,
    k: s.strikeouts,
    sb: baserunning[s.playerId]?.sb ?? 0,
    avg: finite(s.avg),
  };
}

function theirBatter(s: OppBattingRow): BoxScoreBatter {
  return {
    playerId: s.playerId,
    name: s.playerName,
    ab: s.ab,
    r: s.r,
    h: s.h,
    doubles: s.doubles,
    triples: s.triples,
    hr: s.hr,
    rbi: s.rbi,
    bb: s.bb,
    k: s.k,
    sb: s.sb,
    avg: finite(s.avg),
  };
}

function pitcher(s: PitchingStats): BoxScorePitcher {
  return {
    playerId: s.playerId,
    name: s.playerName,
    battersFaced: s.totalPAs,
    inningsPitchedOuts: s.inningsPitchedOuts,
    h: s.hitsAllowed,
    r: s.runsAllowed,
    er: s.earnedRunsAllowed,
    bb: s.walksAllowed,
    k: s.strikeouts,
    hbp: s.hitBatters,
    wp: s.wildPitches,
    pitches: s.totalPitches,
    strikePct: finite(s.strikePercentage),
    threeZeroCounts: s.threeZeroCountPAs,
    era: finite(s.era),
  };
}

function fielder(s: FieldingStatRow): BoxScoreFielder {
  return { playerId: s.playerId, name: s.playerName, position: s.position, po: s.putouts, a: s.assists, e: s.errors };
}

/** Sorted as the web page sorts: most plate appearances, most outs, most chances first. */
export function toBoxScore(bundle: GameStatsBundle, isCoach: boolean): GameBoxScoreResponse {
  const { lineScore, isHome } = bundle;
  const byChances = (a: FieldingStatRow, b: FieldingStatRow) => b.putouts + b.assists - (a.putouts + a.assists);
  const byOuts = (a: PitchingStats, b: PitchingStats) => b.inningsPitchedOuts - a.inningsPitchedOuts;

  const home = {
    runsByInning: lineScore.homeRunsByInning,
    r: lineScore.homeRuns,
    h: lineScore.homeHits,
    e: lineScore.homeErrors,
  };
  const away = {
    runsByInning: lineScore.awayRunsByInning,
    r: lineScore.awayRuns,
    h: lineScore.awayHits,
    e: lineScore.awayErrors,
  };

  return {
    gameId: bundle.game.id,
    status: bundle.game.status as GameBoxScoreResponse['status'],
    weAreHome: isHome,
    us: {
      name: bundle.teamName,
      ...(isHome ? home : away),
      batting: [...bundle.ourBatting]
        .sort((a, b) => b.plateAppearances - a.plateAppearances)
        .map((s) => ourBatter(s, bundle.baserunning)),
      pitching: [...bundle.ourPitching].sort(byOuts).map(pitcher),
      fielding: [...bundle.ourFielding].sort(byChances).map(fielder),
    },
    them: {
      name: bundle.game.opponentName?.trim() || 'Opponent',
      ...(isHome ? away : home),
      batting: [...bundle.oppBatting].sort((a, b) => b.pa - a.pa).map(theirBatter),
      pitching: [...bundle.oppPitching].sort(byOuts).map(pitcher),
      fielding: [...bundle.oppFielding].sort(byChances).map(fielder),
    },
    canExport: isCoach,
  };
}
