import {
  DB_TO_POSITION,
  type OpponentLineupEntry,
  type OpponentLineupResponse,
  type OpponentRosterPlayer,
} from '@baseball/shared';

/** One opponent player's place in the order: a slot (null = bench) and a position enum value. */
export interface OpponentAssignment {
  order: number | null;
  position: string | null;
}

export type OpponentAssignments = Record<string, OpponentAssignment>;

/** The server's order as assignments, every active roster player included. */
export function assignmentsFrom(data: OpponentLineupResponse): OpponentAssignments {
  const byPlayer = new Map(data.lineup.map((row) => [row.opponentPlayerId, row]));
  return Object.fromEntries(
    data.players.map((player) => {
      const row = byPlayer.get(player.id);
      return [player.id, { order: row?.battingOrder ?? null, position: row?.startingPosition ?? null }];
    }),
  );
}

function sameAssignment(a: OpponentAssignment | undefined, b: OpponentAssignment | undefined): boolean {
  return a?.order === b?.order && a?.position === b?.position;
}

/**
 * Carries the coach's unsaved edits onto a fresh server copy: a player the
 * coach changed keeps the change; everyone else (and anyone new to the
 * roster) takes the server's value; removed players drop out.
 */
export function rebaseAssignments(
  previousBaseline: OpponentAssignments,
  draft: OpponentAssignments,
  nextBaseline: OpponentAssignments,
): OpponentAssignments {
  return Object.fromEntries(
    Object.entries(nextBaseline).map(([playerId, server]) => {
      const edited = !sameAssignment(draft[playerId], previousBaseline[playerId]);
      return [playerId, edited && draft[playerId] ? draft[playerId] : server];
    }),
  );
}

export function assignmentsChanged(baseline: OpponentAssignments, draft: OpponentAssignments): boolean {
  return Object.keys(draft).some((playerId) => !sameAssignment(baseline[playerId], draft[playerId]));
}

/** Puts a player in a slot, benching whoever held it — how a coach reshuffles on paper. */
export function assignSlot(assignments: OpponentAssignments, playerId: string, order: number | null): OpponentAssignments {
  const next: OpponentAssignments = {};
  for (const [id, assignment] of Object.entries(assignments)) {
    next[id] = order !== null && id !== playerId && assignment.order === order ? { ...assignment, order: null } : assignment;
  }
  next[playerId] = { ...(next[playerId] ?? { position: null }), order };
  return next;
}

/** Slots offered: at least nine, more for a deep roster, never past the league cap. */
export function slotOptions(rosterSize: number, maxBatters: number): number[] {
  const count = Math.min(Math.max(rosterSize, 9), maxBatters);
  return Array.from({ length: count }, (_, i) => i + 1);
}

/** The order to save: every player, bench included (the server keeps benched pitchers). */
export function lineupEntries(assignments: OpponentAssignments): OpponentLineupEntry[] {
  return Object.entries(assignments).map(([opponentPlayerId, { order, position }]) => ({
    opponentPlayerId,
    battingOrder: order,
    startingPosition: (position ?? null) as OpponentLineupEntry['startingPosition'],
  }));
}

/** Batters in slot order, then the bench by last name. */
export function sortForOrder(players: OpponentRosterPlayer[], assignments: OpponentAssignments): OpponentRosterPlayer[] {
  return [...players].sort((a, b) => {
    const aOrder = assignments[a.id]?.order ?? Number.POSITIVE_INFINITY;
    const bOrder = assignments[b.id]?.order ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.lastName.localeCompare(b.lastName);
  });
}

export function positionLabel(position: string | null | undefined): string | null {
  if (!position) return null;
  return DB_TO_POSITION[position] ?? position;
}

export function opponentPlayerLabel(player: OpponentRosterPlayer): string {
  const name = `${player.firstName} ${player.lastName}`.trim();
  return player.jerseyNumber ? `#${player.jerseyNumber} ${name}` : name;
}
