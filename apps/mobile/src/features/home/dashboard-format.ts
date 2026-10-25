import { formatInTimeZone, formatTime, type DashboardLiveGame, type DashboardResponse } from '@baseball/shared';

/** "Bot 5 · 2 out" for a live game. */
export function liveSituation(game: Pick<DashboardLiveGame, 'inning' | 'isTopOfInning' | 'outs'>): string {
  return `${game.isTopOfInning ? 'Top' : 'Bot'} ${game.inning} · ${game.outs} out`;
}

/** "vs Eagles" or "@ Eagles". */
export function matchup(isHome: boolean, opponentName: string | null): string {
  return `${isHome ? 'vs' : '@'} ${opponentName || 'TBD'}`;
}

/**
 * The live games Home shows from the server. A scorer's own team's games are
 * left to the local resume card, which works offline and opens the scorer.
 */
export function remoteLiveGames(games: DashboardLiveGame[], activeTeamId: string, canScore: boolean): DashboardLiveGame[] {
  return canScore ? games.filter((g) => g.teamId !== activeTeamId) : games;
}

/** "Saturday, Oct 31, 4:00 PM" in the game's zone. */
export function nextGameWhen(scheduledAt: string, timeZone: string | null): string {
  return formatInTimeZone(scheduledAt, timeZone, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The month and day for a list's date column, in the item's zone. */
export function dayParts(date: string, timeZone: string | null): { month: string; day: string } {
  return {
    month: formatInTimeZone(date, timeZone, { month: 'short' }).toUpperCase(),
    day: formatInTimeZone(date, timeZone, { day: 'numeric' }),
  };
}

/** "4:00 PM · Main field" under an upcoming item. */
export function upcomingDetail(date: string, timeZone: string | null, sublabel: string | null): string {
  const time = formatTime(date, timeZone);
  return sublabel ? `${time} · ${sublabel}` : time;
}

/** W, L or T from our side. */
export function result(ourScore: number, theirScore: number): 'W' | 'L' | 'T' {
  if (ourScore > theirScore) return 'W';
  if (ourScore < theirScore) return 'L';
  return 'T';
}

/** The Recent record and Run diff tiles, as on the web dashboard. */
export function recordTiles(record: DashboardResponse['record'], gamesTracked: number) {
  const diff = record.runsFor - record.runsAgainst;
  return {
    record: `${record.wins}–${record.losses}`,
    tracked: `${gamesTracked} game${gamesTracked === 1 ? '' : 's'} tracked`,
    runDiff: `${diff >= 0 ? '+' : ''}${diff}`,
    runs: `${record.runsFor} RF · ${record.runsAgainst} RA`,
    trend: diff >= 0 ? ('up' as const) : ('down' as const),
  };
}
