import type { SupabaseClient } from '@supabase/supabase-js';
import {
  gameIdInputSchema,
  type GameNotesPlayer,
  type GameNotesResponse,
  type GamePlayerAssessment,
} from '@baseball/shared';
import { invalidInput, serviceError, serviceOk, type ServiceResult } from '../result';
import { resolveGameViewer } from './authorize';

const PLAYER_NOTE_COLUMNS =
  'player_id, pitching, hitting, fielding_catching, baserunning, athleticism, attitude, player_notes';

interface PlayerNoteRow {
  player_id: string;
  pitching: string | null;
  hitting: string | null;
  fielding_catching: string | null;
  baserunning: string | null;
  athleticism: string | null;
  attitude: string | null;
  player_notes: string | null;
}

interface PlayerIdentity {
  id: string;
  first_name: string;
  last_name: string;
  jersey_number?: number | null;
}

/**
 * A game's notes as the viewer may see them — the same split the web notes
 * page makes: coaches see everything, a player sees their own entry, a parent
 * sees each linked child on the team, other members see the overall notes.
 */
export async function loadGameNotes(
  db: SupabaseClient,
  actorUserId: string,
  rawInput: unknown,
): Promise<ServiceResult<GameNotesResponse>> {
  const parsed = gameIdInputSchema.safeParse(rawInput);
  if (!parsed.success) return invalidInput(parsed.error);
  const { gameId } = parsed.data;

  const { data: game } = await db.from('games').select('id, team_id').eq('id', gameId).maybeSingle();
  if (!game) return serviceError('not_found', 'Game not found.');
  const teamId = game.team_id as string;

  const viewer = await resolveGameViewer(db, actorUserId, teamId);
  if (!viewer) return serviceError('not_found', 'Game not found.');

  const { data: overall, error: overallError } = await db
    .from('game_notes')
    .select('overall_notes')
    .eq('game_id', gameId)
    .maybeSingle();
  if (overallError) return loadFailed(gameId, actorUserId, 'overall notes', overallError);
  const base = { gameId, overallNotes: (overall?.overall_notes as string | null) ?? null, coachNotes: null };

  if (viewer.isCoach) return loadCoachView(db, actorUserId, gameId, teamId, base.overallNotes);

  const { data: ownPlayer, error: ownPlayerError } = await db
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', teamId)
    .eq('user_id', actorUserId)
    .eq('is_active', true)
    .maybeSingle();
  if (ownPlayerError) return loadFailed(gameId, actorUserId, 'player record', ownPlayerError);

  if (ownPlayer) {
    const notes = await loadPlayerNotes(db, gameId, [ownPlayer.id as string]);
    if (!notes.ok) return loadFailed(gameId, actorUserId, 'player notes', notes.error);
    return serviceOk({
      ...base,
      view: 'player',
      players: [toNotesPlayer(ownPlayer as PlayerIdentity, notes.byPlayer.get(ownPlayer.id as string), true)],
    });
  }

  if (viewer.role === 'parent') {
    const { data: links, error: linksError } = await db
      .from('parent_player_links')
      .select('players(id, first_name, last_name, jersey_number, team_id)')
      .eq('parent_user_id', actorUserId);
    if (linksError) return loadFailed(gameId, actorUserId, 'linked players', linksError);

    const children = (links ?? [])
      .map((link) => {
        const raw = link.players as unknown;
        return (Array.isArray(raw) ? raw[0] : raw) as (PlayerIdentity & { team_id: string }) | null;
      })
      .filter((child): child is PlayerIdentity & { team_id: string } => child !== null && child.team_id === teamId);

    if (children.length > 0) {
      const notes = await loadPlayerNotes(db, gameId, children.map((child) => child.id));
      if (!notes.ok) return loadFailed(gameId, actorUserId, 'player notes', notes.error);
      return serviceOk({
        ...base,
        view: 'parent',
        players: children.map((child) => toNotesPlayer(child, notes.byPlayer.get(child.id), false)),
      });
    }
  }

  return serviceOk({ ...base, view: 'member', players: [] });
}

async function loadCoachView(
  db: SupabaseClient,
  actorUserId: string,
  gameId: string,
  teamId: string,
  overallNotes: string | null,
): Promise<ServiceResult<GameNotesResponse>> {
  const [playersResult, coachNotesResult, playerNotesResult] = await Promise.all([
    db
      .from('players')
      .select('id, first_name, last_name, jersey_number')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('last_name'),
    db.from('game_coach_notes').select('coach_notes').eq('game_id', gameId).maybeSingle(),
    db.from('game_player_notes').select(PLAYER_NOTE_COLUMNS).eq('game_id', gameId),
  ]);
  const error = playersResult.error ?? coachNotesResult.error ?? playerNotesResult.error;
  if (error) return loadFailed(gameId, actorUserId, 'coach notes', error);

  const byPlayer = new Map(((playerNotesResult.data ?? []) as PlayerNoteRow[]).map((row) => [row.player_id, row]));
  return serviceOk({
    gameId,
    view: 'coach',
    overallNotes,
    coachNotes: (coachNotesResult.data?.coach_notes as string | null) ?? null,
    players: ((playersResult.data ?? []) as PlayerIdentity[]).map((player) =>
      toNotesPlayer(player, byPlayer.get(player.id), false),
    ),
  });
}

async function loadPlayerNotes(
  db: SupabaseClient,
  gameId: string,
  playerIds: string[],
): Promise<{ ok: true; byPlayer: Map<string, PlayerNoteRow> } | { ok: false; error: unknown }> {
  const { data, error } = await db
    .from('game_player_notes')
    .select(PLAYER_NOTE_COLUMNS)
    .eq('game_id', gameId)
    .in('player_id', playerIds);
  if (error) return { ok: false, error };
  return { ok: true, byPlayer: new Map(((data ?? []) as PlayerNoteRow[]).map((row) => [row.player_id, row])) };
}

function toAssessment(row: PlayerNoteRow | undefined): GamePlayerAssessment {
  return {
    pitching: row?.pitching ?? null,
    hitting: row?.hitting ?? null,
    fieldingCatching: row?.fielding_catching ?? null,
    baserunning: row?.baserunning ?? null,
    athleticism: row?.athleticism ?? null,
    attitude: row?.attitude ?? null,
  };
}

function toNotesPlayer(player: PlayerIdentity, row: PlayerNoteRow | undefined, isSelf: boolean): GameNotesPlayer {
  return {
    playerId: player.id,
    name: `${player.first_name} ${player.last_name}`.trim(),
    jerseyNumber: player.jersey_number ?? null,
    assessment: toAssessment(row),
    selfNotes: row?.player_notes ?? null,
    canEditSelfNotes: isSelf,
  };
}

function loadFailed(gameId: string, actorUserId: string, what: string, error: unknown): ServiceResult<never> {
  console.error(`[loadGameNotes] game=${gameId} actor=${actorUserId} ${what} read failed:`, error);
  return serviceError('failed', 'Failed to load game notes.');
}
