import type { SupabaseClient } from '@supabase/supabase-js';
import {
  identifyColdHitters,
  practiceIdInputSchema,
  rankHotHitters,
  type HotHitter,
  type PracticeDetailResponse,
  type PracticePlayerNotes,
} from '@baseball/shared';
import { listTeamPracticeReps } from '@baseball/database';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from '../games/authorize';
import { failed } from './practice-lookup';

/** Hot/cold hitters look at the team's reps from this many days back, as on the web. */
const HITTER_LOOKBACK_DAYS = 3;
const HOT_SHOWN = 5;
const COLD_SHOWN = 3;

const NOTE_COLUMNS = 'pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes';

type NotesRow = {
  player_id?: string;
  pitching: string | null;
  hitting: string | null;
  fielding_catching: string | null;
  baserunning: string | null;
  athleticism: string | null;
  attitude: string | null;
  player_notes: string | null;
};
type PlayerRow = { id: string; first_name: string; last_name: string; jersey_number?: number | null; team_id?: string };

/**
 * A practice as its page shows it to the caller (the web practice page):
 * coaches get their notes, every player's notes, the roster and the hot/cold
 * hitters; a player gets their own notes; a parent each linked child's; any
 * other member the overall notes. Team members only.
 */
export async function loadPractice(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<PracticeDetailResponse>> {
  const parsed = practiceIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { practiceId } = parsed.data;

  const { data: practice, error } = await db
    .from('practices')
    .select('id, team_id, scheduled_at, duration_minutes, location, address, latitude, longitude, status, run_status, plan, linked_game_id, prep_focus_summary')
    .eq('id', practiceId)
    .maybeSingle();
  if (error) return failed('loadPractice', practiceId, actorUserId, error);
  if (!practice) return serviceError('not_found', 'Practice not found.');
  const teamId = practice.team_id as string;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Practice not found.');

  try {
    const [prep, notes, own] = await Promise.all([
      loadPrep(db, teamId, practice.linked_game_id as string | null, practice.prep_focus_summary as string | null),
      db.from('practice_notes').select('overall_notes, coach_notes').eq('practice_id', practiceId).maybeSingle(),
      viewer.isCoach ? Promise.resolve([]) : loadOwnPlayers(db, actorUserId, teamId, practiceId, viewer.role),
    ]);
    if (notes.error) throw notes.error;

    const detail: PracticeDetailResponse = {
      practice: {
        id: practice.id as string,
        teamId,
        scheduledAt: practice.scheduled_at as string,
        durationMinutes: (practice.duration_minutes as number | null) ?? null,
        location: (practice.location as string | null) ?? null,
        address: (practice.address as string | null) ?? null,
        latitude: (practice.latitude as number | null) ?? null,
        longitude: (practice.longitude as number | null) ?? null,
        status: practice.status as string,
        runStatus: practice.run_status as string,
        plan: (practice.plan as string | null) || null,
        prep,
      },
      viewer: viewer.isCoach ? 'coach' : own.some((p) => p.canEditSelfNotes) ? 'player' : own.length > 0 ? 'parent' : 'member',
      overallNotes: (notes.data?.overall_notes as string | null) ?? null,
      coach: viewer.isCoach ? await loadCoachView(db, teamId, practiceId, (notes.data?.coach_notes as string | null) ?? null) : null,
      myPlayers: own,
    };
    return serviceOk(detail);
  } catch (loadError) {
    return failed('loadPractice', practiceId, actorUserId, loadError);
  }
}

/** The game a prep practice is for, when it is linked to one of the team's games. */
async function loadPrep(db: SupabaseClient, teamId: string, linkedGameId: string | null, focusSummary: string | null) {
  if (!linkedGameId) return null;
  const { data, error } = await db
    .from('games')
    .select('opponent_name, scheduled_at')
    .eq('id', linkedGameId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) throw error;
  return data ? { opponentName: data.opponent_name as string, scheduledAt: data.scheduled_at as string, focusSummary } : null;
}

/** The caller's own player record on the team, else a parent's linked children on it. */
async function loadOwnPlayers(db: SupabaseClient, actorUserId: string, teamId: string, practiceId: string, role: string | null) {
  const { data: self, error } = await db
    .from('players')
    .select('id, first_name, last_name')
    .eq('team_id', teamId)
    .eq('user_id', actorUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;

  let players: Array<{ player: PlayerRow; canEditSelfNotes: boolean }> = self ? [{ player: self as PlayerRow, canEditSelfNotes: true }] : [];
  if (!self && role === 'parent') {
    const { data: links, error: linksError } = await db
      .from('parent_player_links')
      .select('players(id, first_name, last_name, team_id)')
      .eq('parent_user_id', actorUserId);
    if (linksError) throw linksError;
    players = (links ?? [])
      .map((link) => {
        const raw = link.players as unknown as PlayerRow | PlayerRow[] | null;
        return Array.isArray(raw) ? raw[0] ?? null : raw;
      })
      .filter((p): p is PlayerRow => p !== null && p.team_id === teamId)
      .map((player) => ({ player, canEditSelfNotes: false }));
  }
  if (players.length === 0) return [];

  const { data: noteRows, error: notesError } = await db
    .from('practice_player_notes')
    .select(`player_id, ${NOTE_COLUMNS}`)
    .eq('practice_id', practiceId)
    .in('player_id', players.map((p) => p.player.id));
  if (notesError) throw notesError;
  const byPlayer = new Map(((noteRows ?? []) as NotesRow[]).map((row) => [row.player_id, row]));

  return players.map(({ player, canEditSelfNotes }) => {
    const row = byPlayer.get(player.id);
    return {
      playerId: player.id,
      name: `${player.first_name} ${player.last_name}`.trim(),
      notes: row ? toPlayerNotes(row) : null,
      canEditSelfNotes,
    };
  });
}

/** What only coaches see: their notes, the roster, every player's notes and the ranked hitters. */
async function loadCoachView(db: SupabaseClient, teamId: string, practiceId: string, coachNotes: string | null) {
  const since = new Date(Date.now() - HITTER_LOOKBACK_DAYS * 24 * 3600 * 1000);
  const [playersResult, notesResult, reps] = await Promise.all([
    db.from('players').select('id, first_name, last_name, jersey_number').eq('team_id', teamId).eq('is_active', true).order('last_name'),
    db.from('practice_player_notes').select(`player_id, ${NOTE_COLUMNS}`).eq('practice_id', practiceId),
    listTeamPracticeReps(db as never, teamId, since),
  ]);
  if (playersResult.error) throw playersResult.error;
  if (notesResult.error) throw notesResult.error;

  const hitter = (h: HotHitter) => ({
    playerId: h.playerId,
    rank: h.rank,
    qualityReps: h.evidence.hitHard + h.evidence.lineDrives,
    totalReps: h.evidence.totalReps,
  });

  return {
    coachNotes,
    players: ((playersResult.data ?? []) as PlayerRow[]).map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number ?? null,
    })),
    playerNotes: Object.fromEntries(((notesResult.data ?? []) as NotesRow[]).map((row) => [row.player_id as string, toPlayerNotes(row)])),
    hitters: {
      totalReps: reps.length,
      hot: rankHotHitters(reps, { lookbackDays: HITTER_LOOKBACK_DAYS }).slice(0, HOT_SHOWN).map(hitter),
      cold: identifyColdHitters(reps, { lookbackDays: HITTER_LOOKBACK_DAYS }).slice(0, COLD_SHOWN).map(hitter),
    },
  };
}

/** A `practice_player_notes` row in the response's shape. */
function toPlayerNotes(row: NotesRow): PracticePlayerNotes {
  return {
    pitching: row.pitching,
    hitting: row.hitting,
    fielding_catching: row.fielding_catching,
    baserunning: row.baserunning,
    athleticism: row.athleticism,
    attitude: row.attitude,
    playerNotes: row.player_notes,
  };
}
