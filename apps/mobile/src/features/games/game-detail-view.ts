import { weAreHome, type GameDetailResponse } from '@baseball/shared';

/**
 * What the game detail screen shows, derived from the API payload with the
 * same rules as the web game page. Pure, so the gating is testable without
 * rendering the screen.
 */

type Game = GameDetailResponse['game'];
type BadgeVariant = 'default' | 'safe' | 'warning' | 'danger';

const STATUS_BADGES: Record<Game['status'], { label: string; variant: BadgeVariant }> = {
  scheduled: { label: 'Scheduled', variant: 'default' },
  in_progress: { label: 'In progress', variant: 'safe' },
  completed: { label: 'Final', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  postponed: { label: 'Postponed', variant: 'warning' },
};

export function statusBadge(status: Game['status']) {
  return STATUS_BADGES[status];
}

/** The opponent's name, or 'TBD' for a null or blank one. */
export function opponentLabel(game: Pick<Game, 'opponentName'>): string {
  return game.opponentName?.trim() || 'TBD';
}

/**
 * "vs Eagles" at home, "@ Eagles" away, judged from our side. Takes the bare
 * fields so the offline game lists (WatermelonDB rows) can use it too.
 */
export function matchupLabel(
  opponentName: string | null | undefined,
  locationType: string | null | undefined,
  neutralHomeTeam?: string | null,
): string {
  // An unknown location keeps the lists' historical "vs".
  const vsAt = !locationType || weAreHome(locationType, neutralHomeTeam) ? 'vs' : '@';
  return `${vsAt} ${opponentLabel({ opponentName: opponentName ?? null })}`;
}

export function matchupTitle(game: Game): string {
  return matchupLabel(game.opponentName, game.locationType, game.neutralHomeTeam);
}

export function locationLabel(game: Game): string {
  if (game.locationType === 'home') return 'Home';
  if (game.locationType === 'away') return 'Away';
  return `Neutral site (${game.neutralHomeTeam === 'opponent' ? 'away' : 'home'})`;
}

/** The score from our side: `us` is our runs whichever side we batted on. */
export function scoreFromOurSide(game: Game): { us: number; them: number } {
  const home = weAreHome(game.locationType, game.neutralHomeTeam);
  return home
    ? { us: game.homeScore, them: game.awayScore }
    : { us: game.awayScore, them: game.homeScore };
}

export type ScoreEntry =
  | { kind: 'start'; label: string }
  | { kind: 'continue'; label: string }
  | { kind: 'final'; label: string }
  | { kind: 'needs_opponent' };

export interface GameDetailSections {
  /** Players/parents RSVP while the game hasn't started. */
  rsvpOpen: boolean;
  /** How (and whether) to open the scorer. */
  score: ScoreEntry | null;
  showLineup: boolean;
  /** Coach view of every player's RSVP. */
  showAttendance: boolean;
  showStatsAndHistory: boolean;
  showOpponentLineup: boolean;
  canEdit: boolean;
  canRecalculate: boolean;
  canReset: boolean;
  canCancel: boolean;
}

/**
 * @param canScore The viewer may run the scorer for this game's team: coaching
 *   staff, or the team's scorekeeper.
 */
export function gameDetailSections(detail: GameDetailResponse, canScore: boolean): GameDetailSections {
  const { game, viewer } = detail;
  const coach = viewer.isCoach;
  const started = game.status === 'in_progress' || game.status === 'completed';
  const hasOpponent = opponentLabel(game) !== 'TBD';

  let score: ScoreEntry | null = null;
  if (game.status === 'in_progress') {
    score = { kind: 'continue', label: canScore ? 'Continue scoring' : 'Follow live' };
  } else if (game.status === 'completed') {
    score = { kind: 'final', label: 'View final scorebook' };
  } else if (game.status === 'scheduled' && canScore) {
    // A TBD opponent blocks starting, as on the web: the start flow creates
    // the opponent's team record from its name.
    score = hasOpponent ? { kind: 'start', label: 'Score this game' } : { kind: 'needs_opponent' };
  }

  return {
    rsvpOpen: game.status === 'scheduled' || game.status === 'postponed',
    score,
    showLineup: game.status !== 'cancelled' && (game.status !== 'scheduled' || hasOpponent),
    showAttendance: coach && (game.status === 'scheduled' || game.status === 'postponed'),
    showStatsAndHistory: started,
    showOpponentLineup: coach && game.status !== 'cancelled',
    canEdit: coach,
    canRecalculate: coach && started,
    canReset: coach && game.status !== 'scheduled',
    canCancel: coach && game.status !== 'cancelled',
  };
}
