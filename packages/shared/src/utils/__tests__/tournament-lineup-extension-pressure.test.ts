/**
 * Pressure test: a tournament game that starts with 10 batters on both sides
 * and adds an 11th batter during the second trip through the order.
 *
 * The harness composes the shared helpers exactly the way the mobile score
 * screen (apps/mobile/app/(tabs)/games/[gameId]/score.tsx) does:
 *   - our due batter comes from resolveDueBatter anchored on the last
 *     completed batter (battingOrderHistory + deriveGameState);
 *   - the opponent's due batter in a tournament comes from the
 *     deriveActiveBattingOrder reducer.
 * Every plate appearance asserts that both derivations agree for both sides,
 * so a divergence between the two code paths fails at the exact PA it occurs.
 */
import { EventType, HitType, PitchOutcome, SubstitutionType, type GameEvent } from '../../types';
import {
  battingOrderHistory,
  deriveActiveBattingOrder,
  deriveBattingStats,
  deriveGameState,
  filterVoidedAndRevertedEvents,
  getLineupExtensionHistory,
  getMaxBattingOrder,
  initialBattingOrderSlots,
  isBetweenPlateAppearances,
  isMidGameExtensionAllowed,
  lineupExtensionError,
  resolveDueBatter,
  resolveTournamentGameSettingsCache,
  type ActiveBattingSlot,
} from '../index';

type Side = 'us' | 'them';
type Outcome = 'single' | 'out';

const GAME_ID = 'tournament-game';
const OUR_PITCHER = 'hp';
const THEIR_PITCHER = 'ap';

function lineup(prefix: string, count: number): ActiveBattingSlot[] {
  return Array.from({ length: count }, (_, i) => ({ playerId: `${prefix}${i + 1}`, battingOrder: i + 1 }));
}

function tournamentSettings(lineupRules: Partial<{
  allowExpanded: boolean;
  maxBatters: number;
  allowMidGameExtension: boolean;
  allowMidGameContraction: boolean;
}> = {}) {
  // Same resolution path mobile uses for a downloaded tournament game.
  return resolveTournamentGameSettingsCache({
    tournamentId: 'tournament-1',
    rulesVersion: 1,
    scoringSettings: {
      lineup: {
        allowExpanded: true,
        maxBatters: 11,
        allowMidGameExtension: true,
        allowMidGameContraction: false,
        ...lineupRules,
      },
    },
  });
}

/** Slot 1 singles, everyone else grounds out: #10 makes the third out of every trip. */
const leadoffSingles = (batterId: string): Outcome => (/^[ha]1$/.test(batterId) ? 'single' : 'out');
/** Slots 1 and 2 single: #10 completes each trip mid-half with the half still open. */
const topTwoSingle = (batterId: string): Outcome => (/^[ha][12]$/.test(batterId) ? 'single' : 'out');

/** A home-team mobile scorer (we bat in the bottom half) keeping both books. */
class TournamentGameSim {
  readonly rawEvents: GameEvent[] = [];
  /** Who actually came to the plate, per side, in order. */
  readonly battedLog: Record<Side, string[]> = { us: [], them: [] };
  /** Projected game_lineups rows the server creates after accepting an extension. */
  readonly ourLineupRows: ActiveBattingSlot[];
  readonly theirLineupRows: ActiveBattingSlot[];
  private sequence = 0;

  constructor(
    readonly settings = tournamentSettings(),
    private readonly outcomeFor: (batterId: string) => Outcome = leadoffSingles,
  ) {
    this.ourLineupRows = lineup('h', 10);
    this.theirLineupRows = lineup('a', 10);
    this.push(EventType.GAME_START, {
      homeLeadoffBatterId: 'h1',
      awayLeadoffBatterId: 'a1',
      homeLineupPitcherId: OUR_PITCHER,
      awayLineupPitcherId: THEIR_PITCHER,
    });
  }

  get state() {
    return deriveGameState(GAME_ID, this.rawEvents, 'home-team');
  }

  get battingSide(): Side {
    return this.state.isTopOfInning ? 'them' : 'us';
  }

  push(eventType: EventType | string, payload: Record<string, unknown>, id?: string): GameEvent {
    const state = this.rawEvents.length ? this.state : { inning: 1, isTopOfInning: true };
    this.sequence += 1;
    const event: GameEvent = {
      id: id ?? `e${this.sequence}`,
      gameId: GAME_ID,
      sequenceNumber: this.sequence,
      eventType: eventType as EventType,
      inning: state.inning,
      isTopOfInning: state.isTopOfInning,
      payload,
      occurredAt: new Date(Date.UTC(2026, 9, 15, 12, 0, this.sequence)).toISOString(),
      createdBy: 'coach-1',
      deviceId: 'ios-sim',
    };
    this.rawEvents.push(event);
    return event;
  }

  /** Mirrors score.tsx: both derivations of who is due for one side. */
  derive(side: Side) {
    const rawEvents = this.rawEvents;
    const events = filterVoidedAndRevertedEvents(rawEvents);
    const state = this.state;
    if (side === 'us') {
      const base = initialBattingOrderSlots(this.ourLineupRows, rawEvents);
      const order = deriveActiveBattingOrder(base, events, { batsOnTop: false });
      const history = battingOrderHistory(base, events);
      const last = state.lastCompletedBottomHalfBatterId;
      const resolution = resolveDueBatter(order.slots, state.completedBottomHalfPAs, last ? history.get(last) : null);
      return { order, resolution };
    }
    const order = deriveActiveBattingOrder(this.theirLineupRows, rawEvents, { batsOnTop: true, forOpponent: true });
    const history = battingOrderHistory(order.slots, events, { forOpponent: true });
    const last = state.lastCompletedTopHalfBatterId;
    const resolution = resolveDueBatter(order.slots, state.completedTopHalfPAs, last ? history.get(last) : null);
    return { order, resolution };
  }

  /** The batter the mobile screen would put at the plate for this side. */
  due(side: Side): string {
    const { order, resolution } = this.derive(side);
    const resolverId = resolution.kind === 'due' ? resolution.playerId : null;
    // The two mobile code paths must never disagree about who is up.
    expect({ side, pa: this.battedLog[side].length, reducer: order.nextBatterId })
      .toEqual({ side, pa: this.battedLog[side].length, reducer: resolverId });
    if (!resolverId) throw new Error(`No due batter for ${side} after ${this.battedLog[side].length} PAs`);
    return resolverId;
  }

  activeOrder(side: Side): string[] {
    return this.derive(side).order.slots.map((slot) => slot.playerId);
  }

  timesBatted(side: Side, playerId: string): number {
    return this.battedLog[side].filter((id) => id === playerId).length;
  }

  lastBatter(side: Side): string | undefined {
    return this.battedLog[side][this.battedLog[side].length - 1];
  }

  /** One full plate appearance for whichever side is batting: a ball, then the ball in play. */
  plateAppearance(): void {
    const side = this.battingSide;
    const batterId = this.due(side);
    const attribution = side === 'us'
      ? { batterId, opponentPitcherId: THEIR_PITCHER }
      : { opponentBatterId: batterId, pitcherId: OUR_PITCHER };
    this.push(EventType.PITCH_THROWN, { ...attribution, outcome: PitchOutcome.BALL });
    this.push(EventType.PITCH_THROWN, { ...attribution, outcome: PitchOutcome.IN_PLAY });
    if (this.outcomeFor(batterId) === 'single') {
      this.push(EventType.HIT, { ...attribution, hitType: HitType.SINGLE });
    } else {
      this.push(EventType.OUT, { ...attribution, outType: 'groundout' });
    }
    this.battedLog[side].push(batterId);
    if (this.state.outs >= 3) this.push(EventType.INNING_CHANGE, {});
  }

  playUntil(done: () => boolean, maxPlateAppearances = 200): void {
    for (let i = 0; !done(); i += 1) {
      if (i >= maxPlateAppearances) throw new Error('Scenario never reached its stop condition');
      this.plateAppearance();
    }
  }

  playUntilBatted(counts: Record<Side, number>): void {
    this.playUntil(() => this.battedLog.us.length >= counts.us && this.battedLog.them.length >= counts.them);
  }

  /** Mirrors handleAddBatter / handleAddOpponentBatter: every gate, then the SUBSTITUTION event. */
  addBatter(side: Side, playerId: string): { error: string | null; event?: GameEvent } {
    const forOpponent = side === 'them';
    if (!isMidGameExtensionAllowed(this.settings)) return { error: 'The game rules do not allow lineup extension.' };
    if (!isBetweenPlateAppearances(filterVoidedAndRevertedEvents(this.rawEvents))) {
      return { error: 'Finish the current plate appearance before extending the lineup.' };
    }
    const rows = forOpponent ? this.theirLineupRows : this.ourLineupRows;
    const history = getLineupExtensionHistory(rows, this.rawEvents, { forOpponent });
    if (history.playerIds.has(playerId)) return { error: 'That player is already in the order.' };
    const error = lineupExtensionError({
      activeCount: this.derive(side).order.slots.length,
      maxBatters: getMaxBattingOrder(this.settings),
      maxRecordedPosition: history.maxRecordedPosition,
    });
    if (error) return { error };
    const event = this.push(EventType.SUBSTITUTION, {
      substitutionType: SubstitutionType.LINEUP_EXTENSION,
      inPlayerId: playerId,
      battingOrderPosition: history.maxRecordedPosition + 1,
      ...(forOpponent ? { isOpponentSubstitution: true } : {}),
    });
    return { error: null, event };
  }

  /** The server accepted the extension and synced its projected game_lineups row down. */
  syncProjectedRow(side: Side, playerId: string, battingOrder: number): void {
    (side === 'us' ? this.ourLineupRows : this.theirLineupRows).push({ playerId, battingOrder });
  }
}

function order(prefix: string, ...slots: number[]): string[] {
  return slots.map((slot) => `${prefix}${slot}`);
}
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const positionOf = (event: GameEvent) => (event.payload as { battingOrderPosition: number }).battingOrderPosition;

describe('tournament pressure test: 10 batters, an 11th added in the second trip', () => {
  it('cycles a 10-batter order on both sides before any change', () => {
    const sim = new TournamentGameSim();
    sim.playUntilBatted({ us: 21, them: 21 });

    expect(sim.battedLog.us.slice(0, 21)).toEqual([...order('h', ...range(1, 10)), ...order('h', ...range(1, 10)), 'h1']);
    expect(sim.battedLog.them.slice(0, 21)).toEqual([...order('a', ...range(1, 10)), ...order('a', ...range(1, 10)), 'a1']);
  });

  it('adds an 11th batter early in the second trip and bats them after #10', () => {
    const sim = new TournamentGameSim();
    // Each side, at its own boundary: #1 and #2 have batted twice, #3 is due in trip two.
    sim.playUntil(() => sim.timesBatted('them', 'a2') === 2);
    expect(sim.due('them')).toBe('a3');
    expect(sim.addBatter('them', 'a11').error).toBeNull();
    sim.playUntil(() => sim.timesBatted('us', 'h2') === 2);
    expect(sim.due('us')).toBe('h3');
    expect(sim.addBatter('us', 'h11').error).toBeNull();
    expect(sim.activeOrder('us')).toEqual(order('h', ...range(1, 11)));
    expect(sim.activeOrder('them')).toEqual(order('a', ...range(1, 11)));

    sim.playUntilBatted({ us: 23, them: 23 });
    const expectedTail = (p: string) => [...order(p, ...range(1, 10)), `${p}11`, `${p}1`, `${p}2`];
    expect(sim.battedLog.us.slice(10, 23)).toEqual(expectedTail('h'));
    expect(sim.battedLog.them.slice(10, 23)).toEqual(expectedTail('a'));
  });

  it('adds an 11th batter while #10 is due in the second trip', () => {
    const sim = new TournamentGameSim(tournamentSettings(), topTwoSingle);
    sim.playUntil(() => sim.timesBatted('us', 'h9') === 2);
    expect(sim.due('us')).toBe('h10');
    expect(sim.addBatter('us', 'h11').error).toBeNull();
    expect(sim.due('us')).toBe('h10');

    sim.playUntil(() => sim.timesBatted('them', 'a9') === 2);
    expect(sim.due('them')).toBe('a10');
    expect(sim.addBatter('them', 'a11').error).toBeNull();
    expect(sim.due('them')).toBe('a10');

    sim.playUntilBatted({ us: 22, them: 22 });
    expect(sim.battedLog.us.slice(19, 22)).toEqual(['h10', 'h11', 'h1']);
    expect(sim.battedLog.them.slice(19, 22)).toEqual(['a10', 'a11', 'a1']);
  });

  it('bats the new #11 next when added right after #10 finishes the second trip mid-half', () => {
    const sim = new TournamentGameSim(tournamentSettings(), topTwoSingle);
    sim.playUntil(() => sim.lastBatter('us') === 'h10' && sim.timesBatted('us', 'h10') === 2);
    expect(sim.battingSide).toBe('us'); // #10 made only the first out: the half is still open
    expect(sim.due('us')).toBe('h1');

    expect(sim.addBatter('us', 'h11').error).toBeNull();
    expect(sim.due('us')).toBe('h11');
    sim.plateAppearance();
    expect(sim.lastBatter('us')).toBe('h11');
    expect(sim.due('us')).toBe('h1');
  });

  it('leads off the next half with #11 when added after #10 made the final out of the second trip', () => {
    const sim = new TournamentGameSim();
    sim.playUntil(() => sim.lastBatter('them') === 'a10' && sim.timesBatted('them', 'a10') === 2);
    // a10 made the third out, so the half flipped and we are batting.
    expect(sim.battingSide).toBe('us');
    expect(sim.addBatter('them', 'a11').error).toBeNull();
    expect(sim.due('them')).toBe('a11');

    sim.playUntil(() => sim.battingSide === 'them');
    sim.plateAppearance();
    expect(sim.lastBatter('them')).toBe('a11');
  });

  it('keeps each side independent when only one order grows', () => {
    const sim = new TournamentGameSim();
    sim.playUntil(() => sim.timesBatted('us', 'h4') === 2);
    expect(sim.addBatter('us', 'h11').error).toBeNull();
    sim.playUntilBatted({ us: 30, them: 30 });

    expect(sim.activeOrder('them')).toEqual(order('a', ...range(1, 10)));
    expect(sim.battedLog.them.slice(0, 30)).toEqual([1, 2, 3].flatMap(() => order('a', ...range(1, 10))));
    expect(sim.battedLog.us.slice(10, 30)).toEqual([
      ...order('h', ...range(1, 10)), 'h11', ...order('h', ...range(1, 9)),
    ]);
  });

  it('enforces the cap: an 11-batter tournament rejects a 12th, a 10-batter cap rejects an 11th', () => {
    const atEleven = new TournamentGameSim();
    atEleven.playUntil(() => atEleven.timesBatted('us', 'h1') === 2);
    expect(atEleven.addBatter('us', 'h11').error).toBeNull();
    expect(atEleven.addBatter('us', 'h12').error).toBe('The order is full at 11 batters.');
    expect(atEleven.addBatter('us', 'h11').error).toBe('That player is already in the order.');

    const atTen = new TournamentGameSim(tournamentSettings({ maxBatters: 10 }));
    atTen.playUntil(() => atTen.timesBatted('us', 'h1') === 2);
    expect(atTen.addBatter('us', 'h11').error).toBe('The order is full at 10 batters.');
    expect(atTen.addBatter('them', 'a11').error).toBe('The order is full at 10 batters.');
  });

  it('rejects the addition when mid-game changes are off or a plate appearance is in progress', () => {
    const noChanges = new TournamentGameSim(tournamentSettings({ allowMidGameExtension: false }));
    noChanges.playUntil(() => noChanges.timesBatted('us', 'h1') === 2);
    expect(noChanges.addBatter('us', 'h11').error).toMatch(/do not allow lineup extension/);

    const midPa = new TournamentGameSim();
    midPa.playUntil(() => midPa.timesBatted('us', 'h1') === 2 && midPa.battingSide === 'us');
    midPa.push(EventType.PITCH_THROWN, { batterId: midPa.due('us'), opponentPitcherId: THEIR_PITCHER, outcome: PitchOutcome.BALL });
    expect(midPa.addBatter('us', 'h11').error).toMatch(/Finish the current plate appearance/);
  });

  it('gives the same rotation after the server projects the extension into game_lineups', () => {
    const sim = new TournamentGameSim();
    sim.playUntil(() => sim.timesBatted('us', 'h3') === 2 && sim.timesBatted('them', 'a3') === 2);
    const ours = sim.addBatter('us', 'h11').event!;
    const theirs = sim.addBatter('them', 'a11').event!;
    const beforeSync = { us: sim.activeOrder('us'), them: sim.activeOrder('them'), dueUs: sim.due('us'), dueThem: sim.due('them') };

    sim.syncProjectedRow('us', 'h11', positionOf(ours));
    sim.syncProjectedRow('them', 'a11', positionOf(theirs));
    expect({ us: sim.activeOrder('us'), them: sim.activeOrder('them'), dueUs: sim.due('us'), dueThem: sim.due('them') })
      .toEqual(beforeSync);

    sim.playUntilBatted({ us: 23, them: 23 });
    expect(sim.battedLog.us.slice(19, 23)).toEqual(['h10', 'h11', 'h1', 'h2']);
    expect(sim.battedLog.them.slice(19, 23)).toEqual(['a10', 'a11', 'a1', 'a2']);
  });

  it('restores the 10-batter rotation when the addition is voided before #11 bats', () => {
    const sim = new TournamentGameSim();
    sim.playUntil(() => sim.timesBatted('us', 'h5') === 2);
    const extension = sim.addBatter('us', 'h11').event!;
    sim.push(EventType.EVENT_VOIDED, { voidedEventId: extension.id, voidedSequenceNumber: extension.sequenceNumber });

    expect(sim.activeOrder('us')).toEqual(order('h', ...range(1, 10)));
    sim.playUntil(() => sim.timesBatted('us', 'h10') === 2);
    expect(sim.due('us')).toBe('h1');
    // The voided attempt still reserves its slot and identity (accepted history).
    expect(sim.addBatter('us', 'h11').error).toBe('That player is already in the order.');
    const retry = sim.addBatter('us', 'h12');
    expect(retry.error).toBeNull();
    expect(positionOf(retry.event!)).toBe(12);
  });

  it('drops the addition when a pitch undo reverts past it', () => {
    const sim = new TournamentGameSim();
    sim.playUntil(() => sim.timesBatted('us', 'h5') === 2 && sim.battingSide === 'us');
    const revertTo = sim.rawEvents[sim.rawEvents.length - 1].sequenceNumber;
    expect(sim.addBatter('us', 'h11').error).toBeNull();
    expect(sim.activeOrder('us')).toEqual(order('h', ...range(1, 11)));
    sim.push(EventType.PITCH_REVERTED, { revertToSequenceNumber: revertTo });

    expect(sim.activeOrder('us')).toEqual(order('h', ...range(1, 10)));
    sim.playUntil(() => sim.timesBatted('us', 'h10') === 2);
    expect(sim.due('us')).toBe('h1');
  });

  it('credits #11 with their own plate appearances without touching anyone else\'s stats or pitch counts', () => {
    const sim = new TournamentGameSim();
    sim.playUntil(() => sim.timesBatted('us', 'h2') === 2 && sim.timesBatted('them', 'a2') === 2);
    const before = sim.state;
    expect(sim.addBatter('us', 'h11').error).toBeNull();
    expect(sim.addBatter('them', 'a11').error).toBeNull();
    const after = sim.state;
    expect(after.pitcherPitchCounts).toEqual(before.pitcherPitchCounts);
    expect([after.homeScore, after.awayScore, after.outs]).toEqual([before.homeScore, before.awayScore, before.outs]);

    sim.playUntilBatted({ us: 33, them: 33 });
    const players = [...lineup('h', 11)].map(({ playerId }) => ({ id: playerId, firstName: playerId, lastName: 'Home' }));
    const stats = deriveBattingStats(filterVoidedAndRevertedEvents(sim.rawEvents), players);
    for (const playerId of order('h', ...range(1, 11))) {
      expect({ playerId, pa: stats.get(playerId)?.plateAppearances }).toEqual({ playerId, pa: sim.timesBatted('us', playerId) });
    }
    expect(sim.timesBatted('us', 'h11')).toBe(2);
    expect(sim.timesBatted('them', 'a11')).toBe(2);
    // Two pitches per PA, every one attributed to the right pitcher.
    expect(sim.state.pitcherPitchCounts).toEqual({
      [OUR_PITCHER]: sim.battedLog.them.length * 2,
      [THEIR_PITCHER]: sim.battedLog.us.length * 2,
    });
  });
});
