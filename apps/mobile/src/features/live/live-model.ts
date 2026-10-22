import {
  deriveGameState,
  formatEventDescription,
  weAreHome,
  type GameEvent,
  type HistoryEvent,
  type LiveGameResponse,
  type LiveGameState,
} from '@baseball/shared';

/**
 * Pure helpers for the live viewer — the same derivation as the web /live
 * page: replay the log since the last reset into the game state, and describe
 * plays with the shared formatter.
 */

const GAME_RESET = 'game_reset';

/** The events that count: everything after the last reset. */
export function sinceLastReset(events: HistoryEvent[]): HistoryEvent[] {
  const lastReset = events.map((event) => event.eventType).lastIndexOf(GAME_RESET);
  return lastReset === -1 ? events : events.slice(lastReset + 1);
}

/** Pitch-level state: score, inning, count, outs, runners, batter and pitcher. */
export function liveState(data: LiveGameResponse): LiveGameState {
  const events = sinceLastReset(data.events) as unknown as GameEvent[];
  return deriveGameState(data.game.id, events, data.game.teamId);
}

/** "#4 Abbott", or an em dash for anyone unknown. */
export function livePlayerLabel(players: LiveGameResponse['players'], id: string | null | undefined): string {
  if (!id) return '—';
  const player = players[id];
  if (!player) return '—';
  return `${player.jerseyNumber != null ? `#${player.jerseyNumber} ` : ''}${player.lastName}`;
}

export interface LivePlay {
  id: string;
  text: string;
  inning: number;
  isTopOfInning: boolean;
}

/** An "in play" pitch only announces the play recorded right after it. */
function isInPlayPitch(event: HistoryEvent): boolean {
  return event.eventType === 'pitch_thrown' && (event.payload as { outcome?: unknown }).outcome === 'in_play';
}

/**
 * The latest described plays, newest first. Events with no description
 * (voids, reverts) and in-play pitches (the play that follows says what
 * happened) are skipped.
 */
export function recentPlays(data: LiveGameResponse, limit: number): LivePlay[] {
  const events = sinceLastReset(data.events);
  const plays: LivePlay[] = [];
  for (let i = events.length - 1; i >= 0 && plays.length < limit; i--) {
    const event = events[i];
    if (isInPlayPitch(event)) continue;
    const text = formatEventDescription(event, (id) => livePlayerLabel(data.players, id));
    if (text !== null) plays.push({ id: event.id, text, inning: event.inning, isTopOfInning: event.isTopOfInning });
  }
  return plays;
}

/** The score as the scoreboard shows it: derived live, the stored final otherwise. */
export function liveScore(data: LiveGameResponse, state: LiveGameState): { home: number; away: number } {
  return data.game.status === 'in_progress'
    ? { home: state.homeScore, away: state.awayScore }
    : { home: data.game.homeScore, away: data.game.awayScore };
}

export function liveTeams(data: LiveGameResponse): { away: string; home: string; weAreHome: boolean } {
  const home = weAreHome(data.game.locationType, data.game.neutralHomeTeam);
  const opponent = data.game.opponentName?.trim() || 'TBD';
  return home
    ? { away: opponent, home: data.teamName, weAreHome: true }
    : { away: data.teamName, home: opponent, weAreHome: false };
}

/** A `game_events` row as Realtime delivers it (snake_case). */
export interface GameEventRow {
  id: string;
  game_id: string;
  sequence_number: number;
  event_type: string;
  inning: number;
  is_top_of_inning: boolean;
  payload: Record<string, unknown> | null;
  occurred_at: string;
  created_by: string | null;
  device_id: string | null;
}

/** Adds a new event in sequence order; a duplicate (the backfill racing Realtime) is ignored. */
export function mergeEvent(data: LiveGameResponse, row: GameEventRow): LiveGameResponse {
  if (data.events.some((event) => event.id === row.id)) return data;
  const event: HistoryEvent = {
    id: row.id,
    gameId: row.game_id,
    sequenceNumber: row.sequence_number,
    eventType: row.event_type,
    inning: row.inning,
    isTopOfInning: row.is_top_of_inning,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    createdBy: row.created_by,
    deviceId: row.device_id,
  };
  return { ...data, events: [...data.events, event].sort((a, b) => a.sequenceNumber - b.sequenceNumber) };
}
