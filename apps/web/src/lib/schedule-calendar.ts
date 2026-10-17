import { weAreHome } from '@baseball/shared';
import type { CalendarEvent } from '@/app/(app)/games/CalendarView';

export type ScheduleGame = {
  id: string;
  team_id: string;
  opponent_name: string | null;
  scheduled_at: string;
  location_type: string;
  neutral_home_team: string | null;
  status: string;
  tournament_id: string | null;
};

export type GameCalendarEntry = Omit<CalendarEvent, 'dateKey' | 'time'> & { scheduledAt: string };

/**
 * Turns the Schedule page's games into calendar entries. Tournament games
 * appear like any other game, labeled "Tournament". In league view, other
 * teams' tournament games are left out: they are not league games.
 */
export function buildGameCalendarEntries(
  games: ScheduleGame[],
  { activeTeamId, isLeagueView, teamNameMap }: {
    activeTeamId: string;
    isLeagueView: boolean;
    teamNameMap: Record<string, string>;
  },
): GameCalendarEntry[] {
  return games
    .filter((g) => !(isLeagueView && g.tournament_id && g.team_id !== activeTeamId))
    .map((g) => {
      const loc = weAreHome(g.location_type, g.neutral_home_team) ? 'vs' : '@';
      const teamLabel = isLeagueView && g.team_id !== activeTeamId ? teamNameMap[g.team_id] : null;
      const opponent = g.opponent_name ?? 'TBD';
      const status = g.status !== 'scheduled' ? g.status.replace('_', ' ') : undefined;
      const detailParts = [g.tournament_id ? 'Tournament' : null, status].filter(Boolean);
      return {
        id: g.id,
        type: 'game' as const,
        title: teamLabel ? `${teamLabel}: ${loc} ${opponent}` : `${loc} ${opponent}`,
        url: `/games/${g.id}`,
        detail: detailParts.length ? detailParts.join(' · ') : undefined,
        scheduledAt: g.scheduled_at,
      };
    });
}
