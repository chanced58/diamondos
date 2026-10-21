import type { OpponentLineupResponse } from '@baseball/shared';
import {
  assignSlot,
  assignmentsChanged,
  assignmentsFrom,
  lineupEntries,
  opponentPlayerLabel,
  rebaseAssignments,
  slotOptions,
  sortForOrder,
} from '../opponent-lineup-model';

const player = (id: string, lastName: string, jerseyNumber: string | null = null) => ({
  id, firstName: 'F', lastName, jerseyNumber, primaryPosition: null,
});

const data: OpponentLineupResponse = {
  gameId: 'g1',
  opponentName: 'Eagles',
  opponentTeam: { id: 'ot', name: 'Eagles' },
  maxBatters: 11,
  players: [player('a', 'Adams'), player('b', 'Baker'), player('c', 'Cole')],
  lineup: [
    { opponentPlayerId: 'a', battingOrder: 2, startingPosition: 'shortstop' },
    { opponentPlayerId: 'b', battingOrder: null, startingPosition: 'pitcher' },
  ],
};

describe('assignments', () => {
  it('should include every roster player, benching anyone not in the order', () => {
    expect(assignmentsFrom(data)).toEqual({
      a: { order: 2, position: 'shortstop' },
      b: { order: null, position: 'pitcher' },
      c: { order: null, position: null },
    });
  });

  it('should bench whoever held a slot when another player takes it', () => {
    const next = assignSlot(assignmentsFrom(data), 'c', 2);
    expect(next.c).toEqual({ order: 2, position: null });
    expect(next.a).toEqual({ order: null, position: 'shortstop' });
    expect(assignmentsChanged(assignmentsFrom(data), next)).toBe(true);
  });

  it('should keep unsaved edits across a refresh and take the server for everyone else', () => {
    const baseline = assignmentsFrom(data);
    const draft = assignSlot(baseline, 'c', 1);
    const refreshed = assignmentsFrom({
      ...data,
      players: [...data.players.filter((p) => p.id !== 'b'), player('d', 'Dunn')],
      lineup: [{ opponentPlayerId: 'a', battingOrder: 3, startingPosition: 'shortstop' }],
    });

    expect(rebaseAssignments(baseline, draft, refreshed)).toEqual({
      a: { order: 3, position: 'shortstop' },
      c: { order: 1, position: null },
      d: { order: null, position: null },
    });
  });

  it('should send every player, bench included, for the server to filter', () => {
    expect(lineupEntries({ a: { order: 1, position: null }, b: { order: null, position: 'pitcher' } })).toEqual([
      { opponentPlayerId: 'a', battingOrder: 1, startingPosition: null },
      { opponentPlayerId: 'b', battingOrder: null, startingPosition: 'pitcher' },
    ]);
  });
});

describe('display', () => {
  it('should offer at least nine slots, more for a deep roster, capped by the league', () => {
    expect(slotOptions(3, 11)).toHaveLength(9);
    expect(slotOptions(10, 11)).toHaveLength(10);
    expect(slotOptions(15, 11)).toHaveLength(11);
  });

  it('should list batters in slot order, then the bench by last name', () => {
    const sorted = sortForOrder([player('c', 'Cole'), player('b', 'Baker'), player('a', 'Adams')], {
      a: { order: 2, position: null },
      b: { order: null, position: null },
      c: { order: 1, position: null },
    });
    expect(sorted.map((p) => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('should label a player with their jersey when known', () => {
    expect(opponentPlayerLabel(player('a', 'Adams', '07'))).toBe('#07 F Adams');
    expect(opponentPlayerLabel(player('a', 'Adams'))).toBe('F Adams');
  });
});
