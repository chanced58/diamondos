import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeLeagueGameStandings,
  manualLinesToBattingStats,
  mergeBattingStats,
  mergePitchingStats,
  PLACEHOLDER_PREFIX,
  selectResultSource,
  type LeagueGameResult,
} from '@baseball/shared';
import {
  combinePlayerStats,
  spotlightRows,
  standingRow,
  teamStatRow,
  type PlayerSnapshotRow,
  type PlayerTeamInfo,
} from '../aggregate';
import { replaceLeagueSeasonSnapshot, type LeagueSeasonSnapshot } from '../write';
import { deriveSideStats, type SideStats } from './side-stats';
import {
  loadScheduledLeagueInputs,
  type LeagueGameBook,
  type ScheduledLeagueGame,
  type ScheduledLeagueInputs,
} from './load-inputs';

type Side = 'home' | 'away';
type PlayerNames = ScheduledLeagueInputs['players'];

/** What one league game contributes: its result for the standings and each team's lines. */
interface GameContribution {
  result: LeagueGameResult;
  lines: Record<Side, SideStats>;
}

function emptyLines(): SideStats {
  return { batting: new Map(), pitching: new Map() };
}

function isPlaceholder(id: string): boolean {
  return id.startsWith(PLACEHOLDER_PREFIX);
}

function bookState(book: LeagueGameBook | null) {
  return { completed: book?.finished ?? false, eventCount: book?.eventCount ?? 0 };
}

/** Both teams' lines from one team's book: its own side read with its lineup, the other side through the roster record. */
function bookLines(game: ScheduledLeagueGame, bookSide: Side, players: PlayerNames): Record<Side, SideStats> {
  const book = game[bookSide];
  if (!book) return { home: emptyLines(), away: emptyLines() };
  const maps = bookSide === 'home' ? game.sideMaps.homeBook : game.sideMaps.awayBook;
  const scoring = deriveSideStats({ events: book.events, sideMap: maps.scoringSide, sidePlayers: players, lineup: book.lineup });
  const other = deriveSideStats({ events: book.events, sideMap: maps.otherSide, sidePlayers: players, lineup: undefined });
  return bookSide === 'home' ? { home: scoring, away: other } : { home: other, away: scoring };
}

/** For two books: each player's line from the book `lineFrom` names (the home book unless the home coach chose away). */
function pickLines(fromHome: SideStats, fromAway: SideStats, lineFrom: ReadonlyMap<string, Side>): SideStats {
  const pick = <T>(home: Map<string, T>, away: Map<string, T>): Map<string, T> => {
    const picked = new Map<string, T>();
    for (const id of new Set([...home.keys(), ...away.keys()])) {
      const line = ((lineFrom.get(id) ?? 'home') === 'home' ? home : away).get(id);
      if (line) picked.set(id, line);
    }
    return picked;
  };
  return { batting: pick(fromHome.batting, fromAway.batting), pitching: pick(fromHome.pitching, fromAway.pitching) };
}

function bookRuns(game: ScheduledLeagueGame, side: Side): LeagueGameResult {
  const row = game[side]!.row;
  return {
    homeTeamId: game.homeTeamId,
    awayTeamId: game.awayTeamId,
    homeRuns: row.home_score ?? 0,
    awayRuns: row.away_score ?? 0,
    forfeitWinnerTeamId: null,
  };
}

function manualContribution(game: ScheduledLeagueGame): GameContribution {
  const manual = game.manual!;
  const forfeit = manual.kind === 'forfeit';
  const linesFor = (teamId: string): SideStats => ({
    batting:
      manual.kind === 'batting'
        ? manualLinesToBattingStats(game.manualLines.filter((line) => line.teamId === teamId))
        : new Map(),
    pitching: new Map(),
  });
  return {
    result: {
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      // A forfeit adds no runs to either team.
      homeRuns: forfeit ? 0 : manual.homeRuns ?? 0,
      awayRuns: forfeit ? 0 : manual.awayRuns ?? 0,
      forfeitWinnerTeamId: forfeit ? manual.forfeitWinnerTeamId : null,
    },
    lines: { home: linesFor(game.homeTeamId), away: linesFor(game.awayTeamId) },
  };
}

/**
 * The result and both teams' lines for one league game, from whichever source
 * counts (`selectResultSource`): one book, two books (the home book except
 * where the home coach took the away value), or the hand-entered result.
 * Null when nothing counts yet.
 */
export function resolveGameContribution(game: ScheduledLeagueGame, players: PlayerNames): GameContribution | null {
  const source = selectResultSource({
    home: bookState(game.home),
    away: bookState(game.away),
    reconciliation: game.reconciliation,
    hasManualResult: game.manual !== null,
  });
  switch (source.kind) {
    case 'none':
      return null;
    case 'manual':
      return manualContribution(game);
    case 'single':
      return { result: bookRuns(game, source.side), lines: bookLines(game, source.side, players) };
    case 'dual': {
      const fromHome = bookLines(game, 'home', players);
      const fromAway = bookLines(game, 'away', players);
      return {
        result: bookRuns(game, source.scoreFrom),
        lines: {
          home: pickLines(fromHome.home, fromAway.home, source.playerLineFrom),
          away: pickLines(fromHome.away, fromAway.away, source.playerLineFrom),
        },
      };
    }
  }
}

function mergeInto<T>(target: Map<string, T>, lines: Map<string, T>, merge: (a: T, b: T) => T): void {
  for (const [id, line] of lines) {
    const existing = target.get(id);
    target.set(id, existing ? merge(existing, line) : line);
  }
}

function realPlayersOnly<T>(lines: Map<string, T>): Map<string, T> {
  return new Map([...lines].filter(([id]) => !isPlaceholder(id)));
}

/**
 * Build a scheduled league's snapshot rows from its league games: standings
 * from one result per game, `team` player rows per (player, team they played
 * for), `season` player rows merging each player's team lines under the team
 * of their latest league game, team stats over every line (placeholders
 * included) and spotlights.
 */
export function buildScheduledSnapshot(
  inputs: ScheduledLeagueInputs,
  leagueId: string,
  season: string,
): LeagueSeasonSnapshot {
  const names = new Map(inputs.players.map((player) => [player.id, player]));
  const teamName = (teamId: string) => inputs.teamNames.get(teamId) ?? '';
  const results: LeagueGameResult[] = [];
  const linesByTeam = new Map<string, SideStats>();
  const latestTeamOf = new Map<string, string>();

  // Games are oldest first, so a player's last write here is their latest team.
  for (const game of inputs.games) {
    const contribution = resolveGameContribution(game, inputs.players);
    if (!contribution) continue;
    results.push(contribution.result);
    for (const side of ['home', 'away'] as const) {
      const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
      const lines = contribution.lines[side];
      const teamLines = linesByTeam.get(teamId) ?? emptyLines();
      mergeInto(teamLines.batting, lines.batting, mergeBattingStats);
      mergeInto(teamLines.pitching, lines.pitching, mergePitchingStats);
      linesByTeam.set(teamId, teamLines);
      for (const id of [...lines.batting.keys(), ...lines.pitching.keys()]) {
        if (!isPlaceholder(id)) latestTeamOf.set(id, teamId);
      }
    }
  }

  const playerInfo = (playerId: string, teamId: string): PlayerTeamInfo => ({
    teamId,
    teamName: teamName(teamId),
    firstName: names.get(playerId)?.firstName ?? '',
    lastName: names.get(playerId)?.lastName ?? '',
    optOut: inputs.optOut.get(playerId) ?? false,
  });

  const players: PlayerSnapshotRow[] = [];
  const seasonLines = emptyLines();
  for (const [teamId, lines] of linesByTeam) {
    const batting = realPlayersOnly(lines.batting);
    const pitching = realPlayersOnly(lines.pitching);
    const teamOf = new Map([...new Set([...batting.keys(), ...pitching.keys()])].map((id) => [id, playerInfo(id, teamId)]));
    players.push(...combinePlayerStats({ batting, pitching, fielding: new Map(), teamOf, leagueId, season, scope: 'team' }));
    mergeInto(seasonLines.batting, batting, mergeBattingStats);
    mergeInto(seasonLines.pitching, pitching, mergePitchingStats);
  }
  const seasonTeamOf = new Map([...latestTeamOf].map(([id, teamId]) => [id, playerInfo(id, teamId)]));
  const seasonPlayers = combinePlayerStats({
    batting: seasonLines.batting,
    pitching: seasonLines.pitching,
    fielding: new Map(),
    teamOf: seasonTeamOf,
    leagueId,
    season,
    scope: 'season',
  });
  players.push(...seasonPlayers);

  const records = computeLeagueGameStandings(results, inputs.memberTeamIds);
  const standings = [...records].map(([teamId, record]) =>
    standingRow({
      leagueId,
      season,
      teamId,
      opponentTeamId: null,
      divisionId: inputs.divisionOf.get(teamId) ?? null,
      teamName: teamName(teamId),
      record,
    }),
  );
  const teamStats = [...records].map(([teamId, record]) =>
    teamStatRow({
      leagueId,
      season,
      teamId,
      teamName: teamName(teamId),
      record,
      batting: linesByTeam.get(teamId)?.batting.values() ?? [],
      pitching: linesByTeam.get(teamId)?.pitching.values() ?? [],
    }),
  );

  return { players, standings, teamStats, spotlights: spotlightRows(seasonPlayers, teamStats, leagueId, season) };
}

/**
 * Rebuild the league snapshot of a league that schedules its own games, from
 * its league games only (team-created games never count). Throws with the
 * league and season on any failed read or write.
 */
export async function recomputeScheduledLeagueSnapshot(
  db: SupabaseClient,
  leagueId: string,
  season: string,
): Promise<void> {
  const inputs = await loadScheduledLeagueInputs(db, leagueId, season);
  await replaceLeagueSeasonSnapshot(db, leagueId, season, buildScheduledSnapshot(inputs, leagueId, season));
}
