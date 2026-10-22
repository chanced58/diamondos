import type { SupabaseClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import {
  gameIdInputSchema,
  toHomeTeamPlayerStatsCsv,
  toHomeTeamTeamStatsCsv,
  utcToZonedDateTime,
  type HomeTeamPlayerExportRow,
} from '@baseball/shared';
import { loadGameStats, type GameStatsBundle } from '@/lib/game-stats/load-game-stats';
import { POSITION_PLACEHOLDER_PREFIX } from '@/lib/game-stats/derive';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from './authorize';

const UNPLAYED_STATUSES = ['scheduled', 'cancelled', 'postponed'];

export interface GameExport {
  filename: string;
  /** A ZIP of player-stats.csv and team-stats.csv. */
  content: ArrayBuffer;
}

/** Filesystem-safe slug for the download filename. */
function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';
}

/**
 * One game's stats as a ZIP of CSVs importable into the Home Team
 * (GameChanger) platform — the inverse of the Home Team import
 * (`homeTeamAdapter`). Coaches and platform admins only, once the game has
 * started and has an opponent. Shared by the web download route and the
 * mobile share-sheet route.
 */
export async function buildGameExport(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<GameExport>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  // A light read authorizes before the heavy stat load.
  const { data: meta, error: metaError } = await db
    .from('games')
    .select('team_id, status, opponent_name')
    .eq('id', gameId)
    .maybeSingle();
  if (metaError) {
    console.error(`[buildGameExport] game=${gameId} actor=${actorUserId} game read failed:`, metaError);
    return serviceError('failed', 'Failed to load game for export.');
  }
  if (!meta) return serviceError('not_found', 'Game not found.');

  const viewer = await resolveGameViewer(db, actorUserId, meta.team_id as string);
  if (!viewer) return serviceError('not_found', 'Game not found.');
  if (!viewer.isCoach) return serviceError('forbidden', 'Coach access required.');

  if (UNPLAYED_STATUSES.includes(meta.status as string)) {
    return serviceError('conflict', 'Stats are available only once the game has started.');
  }
  if (!meta.opponent_name) return serviceError('conflict', 'Set the opponent before exporting.');

  const bundle = await loadGameStats(db, gameId);
  if (!bundle) return serviceError('not_found', 'Game not found.');

  return serviceOk(await zipBundle(bundle));
}

async function zipBundle(bundle: GameStatsBundle): Promise<GameExport> {
  const { game, teamName, isHome, lineScore } = bundle;
  const opponent = game.opponentName ?? '';
  const date = game.scheduledAt ? utcToZonedDateTime(game.scheduledAt, game.timeZone).date : null;

  // ── Merge batting / pitching / fielding into one row per player ──────────────
  const rosterById = new Map(bundle.roster.map((p) => [p.id, p]));
  const rows = new Map<string, HomeTeamPlayerExportRow>();

  function ensureRow(playerId: string, fallbackName: string): HomeTeamPlayerExportRow {
    const existing = rows.get(playerId);
    if (existing) return existing;
    const r = rosterById.get(playerId);
    let firstName = r?.firstName ?? '';
    let lastName = r?.lastName ?? '';
    if (!firstName && !lastName && fallbackName) {
      const parts = fallbackName.trim().split(/\s+/);
      firstName = parts[0] ?? '';
      lastName = parts.slice(1).join(' ');
    }
    const row: HomeTeamPlayerExportRow = {
      playerId,
      firstName,
      lastName,
      jerseyNumber: r?.jerseyNumber ?? null,
    };
    rows.set(playerId, row);
    return row;
  }

  for (const b of bundle.ourBatting) ensureRow(b.playerId, b.playerName).batting = b;
  for (const p of bundle.ourPitching) ensureRow(p.playerId, p.playerName).pitching = p;
  for (const f of bundle.ourFielding) {
    // Skip synthetic position placeholders — they aren't real players.
    if (f.playerId.startsWith(POSITION_PLACEHOLDER_PREFIX)) continue;
    ensureRow(f.playerId, f.playerName).fielding = {
      putouts: f.putouts,
      assists: f.assists,
      errors: f.errors,
    };
  }

  const playerCsv = toHomeTeamPlayerStatsCsv(Array.from(rows.values()), { date, opponent });

  // ── Team record for this single game ────────────────────────────────────────
  const ourRuns = isHome ? lineScore.homeRuns : lineScore.awayRuns;
  const oppRuns = isHome ? lineScore.awayRuns : lineScore.homeRuns;
  const teamCsv = toHomeTeamTeamStatsCsv({
    teamName,
    date,
    opponent,
    wins: ourRuns > oppRuns ? 1 : 0,
    losses: ourRuns < oppRuns ? 1 : 0,
    ties: ourRuns === oppRuns ? 1 : 0,
    runsFor: ourRuns,
    runsAgainst: oppRuns,
  });

  const zip = new JSZip();
  zip.file('player-stats.csv', playerCsv);
  zip.file('team-stats.csv', teamCsv);
  const content = await zip.generateAsync({ type: 'arraybuffer' });

  return {
    filename: `home-team-${slug(teamName)}-vs-${slug(opponent)}${date ? `-${date}` : ''}.zip`,
    content,
  };
}
