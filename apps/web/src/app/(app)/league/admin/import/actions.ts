'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase/server';
import { getLeagueAccess } from '@/lib/league-access';
import {
  analyzeImportInputSchema,
  commitImportInputSchema,
  rollbackImportInputSchema,
  homeTeamAdapter,
  autoDetectMapping,
  applyMapping,
  bestMatch,
  parseName,
  normalizePersonName,
  type CommitImportInput,
  type RollbackImportInput,
  type HistoricalCategory,
  type MatchCandidate,
} from '@baseball/shared';

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; meta?: Record<string, unknown> };

const IMPORTS_BUCKET = 'imports';

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireLeagueAdmin(
  leagueId: string,
): Promise<{ user: { id: string } } | { error: string }> {
  const auth = createServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: 'NOT_AUTHENTICATED' };
  const access = await getLeagueAccess(leagueId, user.id);
  if (!access.isLeagueAdmin) return { error: 'FORBIDDEN' };
  return { user };
}

function parsePgError(message: string): { code: string; meta?: Record<string, unknown> } {
  if (message === 'FORBIDDEN') return { code: 'FORBIDDEN' };
  if (message === 'BATCH_NOT_FOUND') return { code: 'BATCH_NOT_FOUND' };
  if (message.startsWith('BAD_ACTION:')) return { code: 'BAD_ACTION' };
  if (message.startsWith('MISSING_MATCH_PLAYER:')) return { code: 'MISSING_MATCH_PLAYER' };
  return { code: 'UNKNOWN' };
}

/** Only the adapter we currently support. */
function adapterFor(_platform: string) {
  return homeTeamAdapter;
}

/**
 * A stable per-player key. Many exports lack a player-id column; we derive one
 * from the normalized name + jersey so the SAME key is used for the match
 * preview, the reconciliation decision (which links player_external_ids), and
 * the stat rows (which resolve player_id via that link). Kept identical in both
 * the analyze and commit paths.
 */
function syntheticExternalId(name: string | null, jersey: number | null): string {
  return `syn:${normalizePersonName(name ?? '')}:${jersey ?? ''}`;
}

/** storage_path holds a JSON array of paths; tolerate a legacy single string. */
function parseStoragePaths(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === 'string');
  } catch {
    // legacy single-path value
  }
  return [value];
}

export interface PlayerMatchPreview {
  externalPlayerId: string | null;
  sourceName: string;
  jerseyNumber: number | null;
  suggestion: {
    playerId: string;
    playerName: string;
    score: number;
    reasons: string[];
    classification: string;
  } | null;
}

export interface AnalyzeResult {
  batchId: string;
  detectedCategories: HistoricalCategory[];
  columnsByCategory: Partial<Record<HistoricalCategory, string[]>>;
  proposedMapping: Partial<Record<HistoricalCategory, Record<string, string>>>;
  /** Valid internal-field tokens per category, for the mapping dropdowns. */
  fieldOptions: Partial<Record<HistoricalCategory, string[]>>;
  sampleRows: Partial<Record<HistoricalCategory, Record<string, string>[]>>;
  matchPreview: PlayerMatchPreview[];
}

/** Load league players as match candidates. */
async function loadCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  leagueId: string,
): Promise<MatchCandidate[]> {
  const { data } = await db
    .from('league_players')
    .select('player_id, players(id, first_name, last_name, jersey_number, date_of_birth)')
    .eq('league_id', leagueId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .map((row) => row.players)
    .filter(Boolean)
    .map((p: Record<string, unknown>) => ({
      playerId: p.id as string,
      firstName: (p.first_name as string) ?? '',
      lastName: (p.last_name as string) ?? '',
      jerseyNumber: (p.jersey_number as number) ?? null,
      dateOfBirth: (p.date_of_birth as string) ?? null,
    }));
}

/**
 * Phase A — upload, parse, detect categories, propose a column mapping, and
 * build a player auto-match preview. Persists everything on the import_batches
 * row so the admin can leave and return; returns the preview for the wizard.
 */
export async function analyzeImportAction(formData: FormData): Promise<Result<AnalyzeResult>> {
  const parsed = analyzeImportInputSchema.safeParse({
    leagueId: formData.get('leagueId'),
    sourcePlatform: formData.get('sourcePlatform'),
  });
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, code: 'NO_FILES', message: 'No files uploaded' };

  const db = service();

  // Create the batch row first so we have an id for the storage path.
  const { data: batch, error: batchError } = await db
    .from('import_batches')
    .insert({
      league_id: parsed.data.leagueId,
      source_platform: parsed.data.sourcePlatform,
      file_name: files.map((f) => f.name).join(', '),
      status: 'analyzing',
      created_by: auth.user.id,
    })
    .select('id')
    .single();
  if (batchError || !batch) {
    return { ok: false, code: 'DB_ERROR', message: batchError?.message ?? 'insert failed' };
  }
  const batchId = batch.id as string;

  // Upload ALL raw files and read their bytes for parsing. We persist every
  // path (as JSON) so commit can re-download and clean up the full set.
  const adapter = adapterFor(parsed.data.sourcePlatform);
  const adapterFiles: { name: string; bytes: Uint8Array }[] = [];
  const storagePaths: string[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${parsed.data.leagueId}/${batchId}/${file.name}`;
    const { error: upErr } = await db.storage
      .from(IMPORTS_BUCKET)
      .upload(path, bytes, { upsert: true, contentType: file.type || 'text/csv' });
    if (upErr) {
      await db.from('import_batches').update({ status: 'failed' }).eq('id', batchId);
      return { ok: false, code: 'UPLOAD_FAILED', message: upErr.message };
    }
    storagePaths.push(path);
    adapterFiles.push({ name: file.name, bytes });
  }

  // Parsing runs on untrusted user files — a malformed CSV/XML must fail the
  // batch with a controlled error, not leave it stuck in 'analyzing'.
  let parsedSource: ReturnType<typeof adapter.detectAndParse>;
  try {
    parsedSource = adapter.detectAndParse(adapterFiles);
  } catch (err) {
    console.error('analyze parse failed', { batchId, leagueId: parsed.data.leagueId, err });
    await db
      .from('import_batches')
      .update({
        status: 'failed',
        storage_path: JSON.stringify(storagePaths),
        error_log: [{ category: 'parse', message: err instanceof Error ? err.message : String(err) }],
      })
      .eq('id', batchId);
    return { ok: false, code: 'PARSE_FAILED', message: 'Could not parse the uploaded file(s).' };
  }

  if (parsedSource.detectedCategories.length === 0) {
    await db
      .from('import_batches')
      .update({ status: 'failed', storage_path: JSON.stringify(storagePaths) })
      .eq('id', batchId);
    return { ok: false, code: 'NO_CATEGORIES', message: 'No importable data detected in the file(s).' };
  }

  // Propose a mapping + expose the valid field tokens per detected category.
  const proposedMapping: AnalyzeResult['proposedMapping'] = {};
  const fieldOptions: AnalyzeResult['fieldOptions'] = {};
  for (const category of parsedSource.detectedCategories) {
    const columns = parsedSource.columnsByCategory[category] ?? [];
    const aliases = adapter.fieldAliases[category] ?? {};
    proposedMapping[category] = autoDetectMapping(columns, aliases);
    fieldOptions[category] = Object.keys(aliases);
  }

  // Build a player auto-match preview from roster/player_stats rows.
  const candidates = await loadCandidates(db, parsed.data.leagueId);
  const matchPreview = buildMatchPreview(parsedSource, proposedMapping, candidates);

  // Sample rows for the review UI (cap to keep the payload small).
  const sampleRows: AnalyzeResult['sampleRows'] = {};
  for (const category of parsedSource.detectedCategories) {
    sampleRows[category] = (parsedSource.rawRows[category] ?? []).slice(0, 5);
  }

  await db
    .from('import_batches')
    .update({
      storage_path: JSON.stringify(storagePaths),
      status: 'previewed',
      detected_categories: parsedSource.detectedCategories,
      mapping: proposedMapping,
      reconciliation: { preview: matchPreview },
    })
    .eq('id', batchId);

  revalidatePath('/league/admin/import');
  return {
    ok: true,
    data: {
      batchId,
      detectedCategories: parsedSource.detectedCategories,
      columnsByCategory: parsedSource.columnsByCategory,
      proposedMapping,
      fieldOptions,
      sampleRows,
      matchPreview,
    },
  };
}

function buildMatchPreview(
  parsedSource: ReturnType<typeof homeTeamAdapter.detectAndParse>,
  mapping: AnalyzeResult['proposedMapping'],
  candidates: MatchCandidate[],
): PlayerMatchPreview[] {
  const category: HistoricalCategory | null = parsedSource.detectedCategories.includes('rosters')
    ? 'rosters'
    : parsedSource.detectedCategories.includes('player_stats')
      ? 'player_stats'
      : null;
  if (!category) return [];

  const map = mapping[category] ?? {};
  const rows = parsedSource.rawRows[category] ?? [];
  const seen = new Set<string>();
  const preview: PlayerMatchPreview[] = [];

  for (const raw of rows) {
    const m = applyMapping(raw, map);
    let firstName = m.firstName ?? '';
    let lastName = m.lastName ?? '';
    if ((!firstName || !lastName) && m.fullName) {
      const parsed = parseName(m.fullName);
      firstName = firstName || parsed.first;
      lastName = lastName || parsed.last;
    }
    const sourceName = `${firstName} ${lastName}`.trim() || (m.fullName ?? '').trim();
    if (!sourceName) continue;

    const jerseyParsed = m.jerseyNumber ? Number.parseInt(m.jerseyNumber, 10) : null;
    const jerseyNumber = Number.isFinite(jerseyParsed as number) ? jerseyParsed : null;
    // Fall back to a synthetic id so name-only rows still link to their stats.
    const externalPlayerId = m.externalPlayerId ?? syntheticExternalId(sourceName, jerseyNumber);

    if (seen.has(externalPlayerId)) continue;
    seen.add(externalPlayerId);

    const match = bestMatch({ firstName, lastName, jerseyNumber }, candidates);

    preview.push({
      externalPlayerId,
      sourceName,
      jerseyNumber,
      suggestion: match
        ? {
            playerId: match.candidate.playerId,
            playerName: `${match.candidate.firstName} ${match.candidate.lastName}`.trim(),
            score: match.score,
            reasons: match.reasons,
            classification: match.classification,
          }
        : null,
    });
  }
  return preview;
}

export interface CommitResult {
  rosters?: { created: number; matched: number; skipped: number };
  playerStats?: { inserted: number; skipped: number; total: number };
  teamStats?: { inserted: number; skipped: number; total: number };
}

/**
 * Phase B — re-read the uploaded file from Storage (authoritative; never trust
 * client-parsed rows), apply the confirmed mapping + reconciliation, and write
 * via the atomic fn_commit_* functions. Each category is its own transaction.
 */
export async function commitImportAction(input: CommitImportInput): Promise<Result<CommitResult>> {
  const parsed = commitImportInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };
  const { batchId, leagueId, confirmedCategories, mapping, reconciliation, seasonContext, subjectTeam } =
    parsed.data;

  const auth = await requireLeagueAdmin(leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();

  // Load + validate the batch belongs to this league and is ready to commit.
  const { data: batch } = await db
    .from('import_batches')
    .select('id, league_id, source_platform, storage_path, status')
    .eq('id', batchId)
    .maybeSingle();
  if (!batch || batch.league_id !== leagueId) {
    return { ok: false, code: 'BATCH_NOT_FOUND', message: 'BATCH_NOT_FOUND' };
  }
  if (!['previewed', 'failed'].includes(batch.status as string)) {
    return { ok: false, code: 'BATCH_NOT_PREVIEWED', message: `status=${batch.status}` };
  }

  // Re-download + re-parse ALL authoritative files from Storage.
  const adapter = adapterFor(batch.source_platform as string);
  const storagePaths = parseStoragePaths(batch.storage_path as string | null);
  if (storagePaths.length === 0) {
    return { ok: false, code: 'DOWNLOAD_FAILED', message: 'no stored file' };
  }
  const adapterFiles: { name: string; bytes: Uint8Array }[] = [];
  for (const path of storagePaths) {
    const { data: blob, error: dlErr } = await db.storage.from(IMPORTS_BUCKET).download(path);
    if (dlErr || !blob) {
      return { ok: false, code: 'DOWNLOAD_FAILED', message: dlErr?.message ?? `missing ${path}` };
    }
    adapterFiles.push({
      name: path.split('/').pop() ?? 'import.csv',
      bytes: new Uint8Array(await blob.arrayBuffer()),
    });
  }

  let parsedSource: ReturnType<typeof adapter.detectAndParse>;
  try {
    parsedSource = adapter.detectAndParse(adapterFiles);
  } catch (err) {
    console.error('commit parse failed', { batchId, leagueId, err });
    await db
      .from('import_batches')
      .update({
        status: 'failed',
        error_log: [{ category: 'parse', message: err instanceof Error ? err.message : String(err) }],
      })
      .eq('id', batchId);
    return { ok: false, code: 'PARSE_FAILED', message: 'Could not parse the stored file(s).' };
  }

  await db.from('import_batches').update({ status: 'committing' }).eq('id', batchId);

  // Resolve the subject team to a team_id or opponent_team_id.
  let teamId: string | null = null;
  let opponentTeamId: string | null = null;
  if (subjectTeam.kind === 'team') {
    teamId = subjectTeam.teamId;
  } else if (subjectTeam.kind === 'opponent') {
    opponentTeamId = subjectTeam.opponentTeamId;
  } else {
    // Reuse an existing league-owned historical team of the same name so a
    // retried commit doesn't create a duplicate opponent.
    const { data: existing } = await db
      .from('opponent_teams')
      .select('id')
      .eq('league_id', leagueId)
      .eq('is_historical', true)
      .eq('name', subjectTeam.name)
      .order('created_at', { ascending: true })
      .limit(1);
    if (existing && existing.length > 0) {
      opponentTeamId = existing[0].id as string;
    } else {
      const { data: oppTeam, error: oppErr } = await db.rpc('fn_create_historical_opponent_team', {
        p_league_id: leagueId,
        p_name: subjectTeam.name,
        p_abbrev: subjectTeam.abbreviation ?? null,
        p_actor: auth.user.id,
      });
      if (oppErr) {
        await db.from('import_batches').update({ status: 'failed' }).eq('id', batchId);
        const e = parsePgError(oppErr.message);
        return { ok: false, code: e.code, message: oppErr.message };
      }
      opponentTeamId = (oppTeam as { id: string }).id;
    }
  }

  const result: CommitResult = {};
  const errorLog: { category: string; message: string }[] = [];

  // ── Rosters ──────────────────────────────────────────────────────────────
  if (confirmedCategories.includes('rosters')) {
    // Created players can only join player_team_memberships when the subject is
    // a real platform team; historical opponent-team players stay guest-only.
    const rows = reconciliation.map((d) => ({
      ...d,
      teamId: d.action === 'create' && teamId ? teamId : null,
    }));
    const { data, error } = await db.rpc('fn_commit_historical_rosters', {
      p_batch_id: batchId,
      p_actor: auth.user.id,
      p_rows: rows,
    });
    if (error) errorLog.push({ category: 'rosters', message: error.message });
    else result.rosters = data as CommitResult['rosters'];
  }

  // ── Player stats ─────────────────────────────────────────────────────────
  if (confirmedCategories.includes('player_stats')) {
    const map = mapping.player_stats ?? {};
    const rows = (parsedSource.rawRows.player_stats ?? [])
      .map((raw) => adapter.normalizePlayerStat(raw, map, seasonContext))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((row) => ({
        ...row,
        // Match the synthetic id used in the reconciliation so stat rows link
        // to the matched/created player.
        externalPlayerId:
          row.externalPlayerId ?? syntheticExternalId(row.playerName, row.jerseyNumber),
        teamId,
        opponentTeamId,
      }));
    const { data, error } = await db.rpc('fn_commit_historical_player_stats', {
      p_batch_id: batchId,
      p_actor: auth.user.id,
      p_rows: rows,
    });
    if (error) errorLog.push({ category: 'player_stats', message: error.message });
    else result.playerStats = data as CommitResult['playerStats'];
  }

  // ── Team stats ───────────────────────────────────────────────────────────
  if (confirmedCategories.includes('team_stats')) {
    const map = mapping.team_stats ?? {};
    const rows = (parsedSource.rawRows.team_stats ?? [])
      .map((raw) => adapter.normalizeTeamStat(raw, map, seasonContext))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((row) => ({ ...row, teamId, opponentTeamId }));
    const { data, error } = await db.rpc('fn_commit_historical_team_stats', {
      p_batch_id: batchId,
      p_actor: auth.user.id,
      p_rows: rows,
    });
    if (error) errorLog.push({ category: 'team_stats', message: error.message });
    else result.teamStats = data as CommitResult['teamStats'];
  }

  const counts: Record<string, unknown> = {
    players_created: result.rosters?.created ?? 0,
    players_matched: result.rosters?.matched ?? 0,
    pgs_rows: result.playerStats?.inserted ?? 0,
    tgs_rows: result.teamStats?.inserted ?? 0,
  };

  await db
    .from('import_batches')
    .update({
      status: errorLog.length > 0 ? 'failed' : 'completed',
      confirmed_categories: confirmedCategories,
      mapping,
      counts,
      error_log: errorLog,
      committed_at: new Date().toISOString(),
    })
    .eq('id', batchId);

  // Raw uploads no longer needed once committed (FERPA/data-minimization); the
  // batch row retains provenance.
  if (errorLog.length === 0 && storagePaths.length > 0) {
    await db.storage.from(IMPORTS_BUCKET).remove(storagePaths);
  }

  revalidatePath('/league/admin/import');
  if (errorLog.length > 0) {
    return { ok: false, code: 'PARTIAL_FAILURE', message: errorLog.map((e) => e.message).join('; '), meta: { result } };
  }
  return { ok: true, data: result };
}

export async function rollbackImportAction(input: RollbackImportInput): Promise<Result<null>> {
  const parsed = rollbackImportInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'VALIDATION', message: parsed.error.message };

  const auth = await requireLeagueAdmin(parsed.data.leagueId);
  if ('error' in auth) return { ok: false, code: auth.error, message: auth.error };

  const db = service();
  const { error } = await db.rpc('fn_rollback_import_batch', {
    p_batch_id: parsed.data.batchId,
    p_actor: auth.user.id,
  });
  if (error) {
    const e = parsePgError(error.message);
    return { ok: false, code: e.code, message: error.message };
  }
  revalidatePath('/league/admin/import');
  return { ok: true, data: null };
}
