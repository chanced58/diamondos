import { weAreHome } from '@baseball/shared';

/**
 * Pure name/home-away resolution for the scoring screen (M6) — split out of
 * `use-game-identity.ts` so it stays free of React *and* of the WatermelonDB
 * `database` import that hook needs. `../../db` initializes a real
 * `SQLiteAdapter` at module load (native JSI), which throws under Jest;
 * keeping this file free of that import is what lets `resolveGameIdentity`
 * be unit-tested directly instead of needing a screen render.
 *
 * Entering the scoring screen via a deep link or push notification only
 * ever supplied `gameId`, so the screen's old route-param fallbacks
 * (`opponentName = 'Opponent'`, `teamName = 'Home'`) rendered literally
 * instead of resolving against the synced game record. In-app navigation
 * happened to pass the real names, which is why the bug only showed up on
 * the deep-link/notification entry path.
 */

/** The subset of a WatermelonDB `Game` row `resolveGameIdentity` needs. */
export interface GameIdentityGame {
  teamId: string;
  opponentName: string;
  locationType: string;
  neutralHomeTeam: string | null;
}

export interface GameIdentityParams {
  teamId?: string;
  teamName?: string;
  opponentName?: string;
}

export interface GameIdentityActiveTeam {
  teamId: string;
  teamName: string;
}

export interface GameIdentityInput {
  game: GameIdentityGame | null;
  params: GameIdentityParams;
  activeTeam: GameIdentityActiveTeam | null;
}

export interface GameIdentity {
  teamId: string;
  isHome: boolean;
  teamName: string;
  opponentName: string;
  homeLabel: string;
  awayLabel: string;
}

const FALLBACK_OPPONENT_NAME = 'Opponent';
const FALLBACK_TEAM_NAME = 'Home';
// Matches the convention `games/index.tsx` already uses for the same data
// state (`game.opponentName || 'TBD'`) — reused here rather than inventing a
// third spelling for "no opponent recorded."
const NO_OPPONENT_RECORDED = 'TBD';

function nonEmpty(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveOpponentName(game: GameIdentityGame | null, params: GameIdentityParams): string {
  const fromGame = nonEmpty(game?.opponentName);
  if (fromGame) return fromGame;

  const fromParam = nonEmpty(params.opponentName);
  if (fromParam) return fromParam;

  // `mapGame` coerces a NULL server `opponent_name` to `''` (sync-engine.ts),
  // so once `game` has loaded, an empty name is a confirmed "no opponent
  // recorded" state — not missing data — and gets the TBD convention rather
  // than the generic loading placeholder used before `game` resolves.
  return game ? NO_OPPONENT_RECORDED : FALLBACK_OPPONENT_NAME;
}

function resolveTeamName(
  teamId: string,
  params: GameIdentityParams,
  activeTeam: GameIdentityActiveTeam | null,
): string {
  // There is no local `teams` table, so `activeTeam.teamName` (from
  // RoleProvider) is the only source of our own team's name. But
  // `public_view_in_progress_games` has no `TO` clause, so a device can
  // mirror an in-progress game belonging to a different team — labelling
  // that game with the active team's name would be confidently wrong rather
  // than obviously generic, so only trust it when the ids actually match.
  if (activeTeam && activeTeam.teamId === teamId) return activeTeam.teamName;

  const fromParam = nonEmpty(params.teamName);
  if (fromParam) return fromParam;

  return FALLBACK_TEAM_NAME;
}

/**
 * Pure name/home-away resolution — no React, no I/O. Directly unit-testable.
 */
export function resolveGameIdentity(input: GameIdentityInput): GameIdentity {
  const { game, params, activeTeam } = input;

  const teamId = game?.teamId ?? nonEmpty(params.teamId) ?? '';
  const isHome = game ? weAreHome(game.locationType, game.neutralHomeTeam ?? null) : true;

  const opponentName = resolveOpponentName(game, params);
  const teamName = resolveTeamName(teamId, params, activeTeam);

  // ScoreBoard maps teamName→homeScore and opponentName→awayScore, so the
  // labels must be the actual home/away teams, not our-team/opponent — for a
  // road game those are swapped.
  const homeLabel = isHome ? teamName : opponentName;
  const awayLabel = isHome ? opponentName : teamName;

  return { teamId, isHome, teamName, opponentName, homeLabel, awayLabel };
}
