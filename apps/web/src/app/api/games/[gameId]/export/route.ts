/**
 * Export one game's stats as a ZIP bundle of CSVs importable into the
 * Home Team (GameChanger) platform. Coach/platform-admin only.
 *
 * Files in the bundle:
 *   - player-stats.csv  (batting + pitching + fielding, one row per player)
 *   - team-stats.csv     (one row: W/L/T + runs for/against)
 *
 * The CSV schema mirrors `homeTeamAdapter`, so the export is the inverse of the
 * existing Home Team import.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import JSZip from 'jszip';
import {
  toHomeTeamPlayerStatsCsv,
  toHomeTeamTeamStatsCsv,
  type HomeTeamPlayerExportRow,
} from '@baseball/shared';
import { createServerClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/user-access';
import { loadGameStats } from '@/lib/game-stats/load-game-stats';
import { POSITION_PLACEHOLDER_PREFIX } from '@/lib/game-stats/derive';

const UNPLAYED_STATUSES = ['scheduled', 'cancelled', 'postponed'];

/** Filesystem-safe slug for the download filename. */
function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { gameId: string } },
) {
  const authClient = createServerClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Lightweight fetch first so we authorize before doing the heavy stat load.
  const { data: gameMeta } = await db
    .from('games')
    .select('team_id, status, opponent_name')
    .eq('id', params.gameId)
    .single();

  if (!gameMeta) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const { isCoach, isPlatformAdmin } = await getUserAccess(gameMeta.team_id, user.id);
  if (!isCoach && !isPlatformAdmin) {
    return NextResponse.json({ error: 'Coach access required' }, { status: 403 });
  }

  if (UNPLAYED_STATUSES.includes(gameMeta.status)) {
    return NextResponse.json(
      { error: 'Stats are available only once the game has started.' },
      { status: 400 },
    );
  }

  if (!gameMeta.opponent_name) {
    return NextResponse.json(
      { error: 'Set the opponent before exporting.' },
      { status: 400 },
    );
  }

  const bundle = await loadGameStats(db, params.gameId);
  if (!bundle) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 });
  }

  const { game, teamName, isHome, lineScore } = bundle;
  const opponent = game.opponentName ?? '';
  const date = game.scheduledAt ? game.scheduledAt.slice(0, 10) : null;

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

  // ── Bundle ──────────────────────────────────────────────────────────────────
  const zip = new JSZip();
  zip.file('player-stats.csv', playerCsv);
  zip.file('team-stats.csv', teamCsv);
  const content = await zip.generateAsync({ type: 'arraybuffer' });

  const filename = `home-team-${slug(teamName)}-vs-${slug(opponent)}${date ? `-${date}` : ''}.zip`;

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
