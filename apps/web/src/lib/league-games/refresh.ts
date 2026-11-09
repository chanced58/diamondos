import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isFinishedBook,
  selectResultSource,
  type ReconciliationOverride,
  type ResultSource,
  type ScoreConflict,
} from '@baseball/shared';
import { runReconciliationForGame } from '@/lib/dual-scorekeeper/reconcile';
import { recomputeLeagueSnapshot } from '@/lib/league-snapshot/recompute';
import { sendPush } from '@/lib/notifications/send-push';

/**
 * Bring a league game up to date after one of its inputs changed: a team
 * finished scoring, a two-book difference was settled, a hand-entered result
 * was saved, or the game was cancelled. Writes the league result onto the
 * team rows that have no book of their own, reconciles two books (and tells
 * both teams when they disagree), and rebuilds the league stats snapshot.
 */

const NOTIFY_ROLES = ['head_coach', 'assistant_coach', 'athletic_director', 'scorekeeper'];

interface LeagueGameRow {
  id: string;
  league_id: string;
  season: string;
  status: string;
  home_team_id: string;
  away_team_id: string;
  home_game_id: string | null;
  away_game_id: string | null;
  home_runs: number | null;
  away_runs: number | null;
}

interface TeamRow {
  id: string;
  status: string;
  result_source: string | null;
  home_score: number | null;
  away_score: number | null;
  eventCount: number;
  latestEventAt: string | null;
}

interface ReconciliationRow {
  id: string;
  computed_at: string;
  conflicts: ScoreConflict[];
  overrides: ReconciliationOverride[];
}

interface Runs {
  home: number;
  away: number;
}

function fail(what: string, leagueGameId: string, error: unknown): never {
  const message = (error as { message?: string } | null)?.message ?? String(error);
  throw new Error(`${what} failed league_game=${leagueGameId}: ${message}`);
}

async function loadLeagueGame(db: SupabaseClient, leagueGameId: string): Promise<LeagueGameRow | null> {
  const { data, error } = await db
    .from('league_games')
    .select('id, league_id, season, status, home_team_id, away_team_id, home_game_id, away_game_id, home_runs, away_runs')
    .eq('id', leagueGameId)
    .maybeSingle();
  if (error) fail('league_games load', leagueGameId, error);
  return (data as LeagueGameRow | null) ?? null;
}

/** A team's row with its event count and the time its latest event reached the server. */
async function loadTeamRow(db: SupabaseClient, gameId: string | null, leagueGameId: string): Promise<TeamRow | null> {
  if (!gameId) return null;
  const [game, events] = await Promise.all([
    db.from('games').select('id, status, result_source, home_score, away_score').eq('id', gameId).maybeSingle(),
    db
      .from('game_events')
      .select('synced_at', { count: 'exact' })
      .eq('game_id', gameId)
      .order('synced_at', { ascending: false })
      .limit(1),
  ]);
  if (game.error) fail(`games load ${gameId}`, leagueGameId, game.error);
  if (events.error) fail(`game_events load ${gameId}`, leagueGameId, events.error);
  if (!game.data) return null;
  const latest = (events.data as { synced_at: string }[] | null)?.[0]?.synced_at ?? null;
  return { ...(game.data as Omit<TeamRow, 'eventCount' | 'latestEventAt'>), eventCount: events.count ?? 0, latestEventAt: latest };
}

async function loadReconciliation(
  db: SupabaseClient,
  homeGameId: string,
  leagueGameId: string,
): Promise<ReconciliationRow | null> {
  const { data, error } = await db
    .from('game_reconciliations')
    .select('id, computed_at, conflicts, resolved_overrides')
    .eq('home_game_id', homeGameId)
    .maybeSingle();
  if (error) fail('game_reconciliations load', leagueGameId, error);
  if (!data) return null;
  return {
    id: data.id as string,
    computed_at: data.computed_at as string,
    conflicts: Array.isArray(data.conflicts) ? (data.conflicts as ScoreConflict[]) : [],
    overrides: Array.isArray(data.resolved_overrides) ? (data.resolved_overrides as ReconciliationOverride[]) : [],
  };
}

function bookState(row: TeamRow | null) {
  return { completed: isFinishedBook(row), eventCount: row?.eventCount ?? 0 };
}

function bookCounts(row: TeamRow | null): row is TeamRow {
  return row !== null && isFinishedBook(row) && row.eventCount > 0;
}

function isStale(reconciliation: ReconciliationRow, home: TeamRow, away: TeamRow): boolean {
  const computedAt = Date.parse(reconciliation.computed_at);
  return [home.latestEventAt, away.latestEventAt].some((at) => at !== null && Date.parse(at) > computedAt);
}

/** Options for `refreshLeagueGame`. */
export interface RefreshLeagueGameOptions {
  /**
   * Recompute the reconciliation even though no book changed: a placeholder
   * was matched, so a player the books could not line up before now can.
   */
  forceReconcile?: boolean;
}

/**
 * Step 2: with both books complete, (re)compute the reconciliation when there
 * is none, a book changed since it was computed, or the caller forces it.
 * Reports whether a new one was created, so the teams are told about a
 * discrepancy only once.
 */
async function reconcileBooks(
  db: SupabaseClient,
  leagueGameId: string,
  home: TeamRow | null,
  away: TeamRow | null,
  actorUserId: string | undefined,
  forceReconcile: boolean,
): Promise<{ reconciliation: ReconciliationRow | null; created: boolean }> {
  if (!home) return { reconciliation: null, created: false };
  const existing = await loadReconciliation(db, home.id, leagueGameId);
  if (!bookCounts(home) || !bookCounts(away)) return { reconciliation: existing, created: false };
  if (existing && !forceReconcile && !isStale(existing, home, away)) return { reconciliation: existing, created: false };

  const reconciliationId = await runReconciliationForGame(db, home.id, actorUserId);
  const reconciliation = await loadReconciliation(db, home.id, leagueGameId);
  return { reconciliation, created: existing === null && reconciliationId !== null };
}

async function loadManualRuns(db: SupabaseClient, leagueGameId: string): Promise<Runs | null> {
  const { data, error } = await db
    .from('league_game_manual_results')
    .select('kind, home_runs, away_runs')
    .eq('league_game_id', leagueGameId)
    .maybeSingle();
  if (error) fail('league_game_manual_results load', leagueGameId, error);
  if (!data) return null;
  // A forfeit adds no runs to either team.
  if (data.kind === 'forfeit') return { home: 0, away: 0 };
  return { home: (data.home_runs as number | null) ?? 0, away: (data.away_runs as number | null) ?? 0 };
}

function bookRuns(source: ResultSource, home: TeamRow | null, away: TeamRow | null): Runs | null {
  if (source.kind !== 'single' && source.kind !== 'dual') return null;
  const side = source.kind === 'single' ? source.side : source.scoreFrom;
  const row = side === 'home' ? home : away;
  if (!row) return null;
  return { home: row.home_score ?? 0, away: row.away_score ?? 0 };
}

/**
 * Whether a row may carry the league result: it has no book of its own and
 * isn't being scored or cancelled. A book result goes only onto a scheduled
 * row or one an earlier refresh wrote; a hand-entered result onto both rows.
 */
function takesResult(row: TeamRow | null, resultSource: 'paired' | 'manual'): row is TeamRow {
  if (!row || row.eventCount > 0) return false;
  if (row.status === 'in_progress' || row.status === 'cancelled') return false;
  if (resultSource === 'manual') return true;
  return row.status === 'scheduled' || row.result_source !== null;
}

async function writeResult(
  db: SupabaseClient,
  leagueGameId: string,
  rows: (TeamRow | null)[],
  runs: Runs,
  resultSource: 'paired' | 'manual',
): Promise<void> {
  const now = new Date().toISOString();
  for (const row of rows) {
    if (!takesResult(row, resultSource)) continue;
    const unchanged =
      row.status === 'completed' &&
      row.home_score === runs.home &&
      row.away_score === runs.away &&
      row.result_source === resultSource;
    if (unchanged) continue;
    const { error } = await db
      .from('games')
      .update({
        status: 'completed',
        home_score: runs.home,
        away_score: runs.away,
        result_source: resultSource,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', row.id);
    if (error) fail(`games result write ${row.id}`, leagueGameId, error);
  }
}

/**
 * Puts the runs of the result that counts on the league game (null when
 * nothing counts), so every list shows the resolved score rather than one
 * row's; a result marks it completed. Skips the write when nothing changed.
 */
async function writeLeagueGameResult(db: SupabaseClient, leagueGame: LeagueGameRow, runs: Runs | null): Promise<void> {
  const homeRuns = runs?.home ?? null;
  const awayRuns = runs?.away ?? null;
  const status = runs ? 'completed' : leagueGame.status;
  const unchanged =
    leagueGame.status === status && leagueGame.home_runs === homeRuns && leagueGame.away_runs === awayRuns;
  if (unchanged) return;
  const { error } = await db
    .from('league_games')
    .update({ status, home_runs: homeRuns, away_runs: awayRuns })
    .eq('id', leagueGame.id);
  if (error) fail('league_games result write', leagueGame.id, error);
}

/** Step 3: resolve which result counts and put it on the league game and the rows without a book. */
async function applyResult(
  db: SupabaseClient,
  leagueGame: LeagueGameRow,
  home: TeamRow | null,
  away: TeamRow | null,
  reconciliation: ReconciliationRow | null,
): Promise<void> {
  const manualRuns = await loadManualRuns(db, leagueGame.id);
  const source = selectResultSource({
    home: bookState(home),
    away: bookState(away),
    reconciliation: reconciliation ? { conflicts: reconciliation.conflicts, overrides: reconciliation.overrides } : null,
    hasManualResult: manualRuns !== null,
  });
  const runs = source.kind === 'manual' ? manualRuns : bookRuns(source, home, away);
  await writeLeagueGameResult(db, leagueGame, runs);
  if (!runs) return;
  await writeResult(db, leagueGame.id, [home, away], runs, source.kind === 'manual' ? 'manual' : 'paired');
}

/** Step 4: tell the coaches and scorekeepers of both teams that the two books disagree. */
async function notifyMismatch(db: SupabaseClient, leagueGame: LeagueGameRow): Promise<void> {
  const teamIds = [leagueGame.home_team_id, leagueGame.away_team_id];
  const [teams, members] = await Promise.all([
    db.from('teams').select('id, name').in('id', teamIds),
    db
      .from('team_members')
      .select('user_id, team_id')
      .in('team_id', teamIds)
      .in('role', NOTIFY_ROLES)
      .eq('is_active', true),
  ]);
  if (teams.error) fail('teams load', leagueGame.id, teams.error);
  if (members.error) fail('team_members load', leagueGame.id, members.error);

  const nameOf = new Map(((teams.data ?? []) as { id: string; name: string }[]).map((team) => [team.id, team.name]));
  const homeName = nameOf.get(leagueGame.home_team_id) ?? 'Home';
  const awayName = nameOf.get(leagueGame.away_team_id) ?? 'Away';
  const memberRows = (members.data ?? []) as { user_id: string; team_id: string }[];

  const sides = [
    { teamId: leagueGame.home_team_id, gameId: leagueGame.home_game_id },
    { teamId: leagueGame.away_team_id, gameId: leagueGame.away_game_id },
  ];
  for (const { teamId, gameId } of sides) {
    if (!gameId) continue;
    const userIds = [...new Set(memberRows.filter((row) => row.team_id === teamId).map((row) => row.user_id))];
    await sendPush(db, {
      userIds,
      title: "Scorebooks don't match",
      body: `Both teams scored ${homeName} vs ${awayName}. Review the differences.`,
      data: { kind: 'game', gameId },
    });
  }
}

async function refreshResult(
  db: SupabaseClient,
  leagueGame: LeagueGameRow,
  actorUserId: string | undefined,
  options: RefreshLeagueGameOptions,
): Promise<void> {
  const [home, away] = await Promise.all([
    loadTeamRow(db, leagueGame.home_game_id, leagueGame.id),
    loadTeamRow(db, leagueGame.away_game_id, leagueGame.id),
  ]);
  const { reconciliation, created } = await reconcileBooks(
    db,
    leagueGame.id,
    home,
    away,
    actorUserId,
    options.forceReconcile ?? false,
  );
  await applyResult(db, leagueGame, home, away, reconciliation);
  if (created && reconciliation && reconciliation.conflicts.length > 0) await notifyMismatch(db, leagueGame);
}

/**
 * Refresh a league game after it changed. In order: read both team rows and
 * their events; reconcile two complete books when they changed or
 * `forceReconcile` asks (notifying both teams when a new reconciliation finds
 * differences); resolve the result source, put its runs
 * on the league game (marking it completed) and write the result onto rows
 * without a book; then rebuild the league snapshot. A cancelled league game
 * only has its runs cleared before the rebuild.
 * Errors are logged with the league game id and never thrown.
 */
export async function refreshLeagueGame(
  db: SupabaseClient,
  leagueGameId: string,
  actorUserId?: string,
  options: RefreshLeagueGameOptions = {},
): Promise<void> {
  let leagueGame: LeagueGameRow | null;
  try {
    leagueGame = await loadLeagueGame(db, leagueGameId);
  } catch (error) {
    console.error(`[refreshLeagueGame] league_game=${leagueGameId}:`, error);
    return;
  }
  if (!leagueGame) {
    console.error(`[refreshLeagueGame] league game not found league_game=${leagueGameId}`);
    return;
  }

  try {
    if (leagueGame.status === 'cancelled') await writeLeagueGameResult(db, leagueGame, null);
    else await refreshResult(db, leagueGame, actorUserId, options);
  } catch (error) {
    console.error(`[refreshLeagueGame] result refresh failed league_game=${leagueGameId}:`, error);
  }

  try {
    await recomputeLeagueSnapshot(db, leagueGame.league_id, leagueGame.season);
  } catch (error) {
    console.error(`[refreshLeagueGame] snapshot recompute failed league_game=${leagueGameId}:`, error);
  }
}
