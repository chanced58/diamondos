import { defaultLeagueScoringSettings, EventType, SubstitutionType, type GameEvent } from '../../index';
import {
  createActiveBattingOrderReducer,
  deriveActiveBattingOrder,
  isBetweenPlateAppearances,
  validateLineupContraction,
  type ActiveBattingSlot,
} from '../active-batting-order';

const initialSlots: ActiveBattingSlot[] = [
  { playerId: 'p1', battingOrder: 1 },
  { playerId: 'p2', battingOrder: 2 },
  { playerId: 'p3', battingOrder: 3 },
];

function event(
  sequenceNumber: number,
  eventType: string,
  payload: Record<string, unknown> = {},
  isTopOfInning = false,
  id = `e${sequenceNumber}`,
): GameEvent {
  return {
    id,
    gameId: 'game-1',
    sequenceNumber,
    eventType: eventType as EventType,
    inning: 1,
    isTopOfInning,
    payload,
    occurredAt: '2026-10-13T12:00:00.000Z',
    createdBy: 'coach-1',
    deviceId: 'web',
  };
}

function completedPa(sequenceNumber: number, isTopOfInning = false) {
  return event(sequenceNumber, EventType.OUT, { outType: 'groundout' }, isTopOfInning);
}

describe('active batting order reducer', () => {
  it('allows a change at a new half inning before its first pitch', () => {
    expect(isBetweenPlateAppearances([
      event(1, EventType.PITCH_THROWN),
      completedPa(2),
      event(3, EventType.INNING_CHANGE),
    ])).toBe(true);
    expect(isBetweenPlateAppearances([
      event(1, EventType.PITCH_THROWN),
      completedPa(2),
      event(3, EventType.INNING_CHANGE),
      event(4, EventType.PITCH_THROWN),
    ])).toBe(false);
  });

  it('keeps the next stable slot when a slot before it is removed after multiple rotations', () => {
    const reducer = createActiveBattingOrderReducer(initialSlots, { batsOnTop: false });
    [1, 2, 3, 4, 5].forEach((sequence) => reducer.apply(completedPa(sequence)));

    reducer.apply(event(6, EventType.SUBSTITUTION, {
      substitutionType: SubstitutionType.LINEUP_CONTRACTION,
      outPlayerId: 'p1',
      battingOrderPosition: 1,
    }));

    expect(reducer.snapshot()).toMatchObject({
      slots: [
        { playerId: 'p2', battingOrder: 2 },
        { playerId: 'p3', battingOrder: 3 },
      ],
      nextBatterId: 'p3',
      nextBattingOrderPosition: 3,
    });
    reducer.apply(completedPa(7));
    expect(reducer.snapshot().nextBatterId).toBe('p2');
  });

  it('keeps the cursor stable when a slot after it is removed', () => {
    const state = deriveActiveBattingOrder(
      initialSlots,
      [1, 2, 3, 4].map((sequence) => completedPa(sequence)),
      { batsOnTop: false },
    );
    const reducer = createActiveBattingOrderReducer(initialSlots, { batsOnTop: false });
    [1, 2, 3, 4].forEach((sequence) => reducer.apply(completedPa(sequence)));
    reducer.apply(event(5, EventType.SUBSTITUTION, {
      substitutionType: SubstitutionType.LINEUP_CONTRACTION,
      outPlayerId: 'p3',
      battingOrderPosition: 3,
    }));

    expect(state.nextBatterId).toBe('p2');
    expect(reducer.snapshot().nextBatterId).toBe('p2');
    reducer.apply(completedPa(6));
    expect(reducer.snapshot().nextBatterId).toBe('p1');
  });

  it('replays an expansion followed by a contraction without changing remaining slot order', () => {
    const state = deriveActiveBattingOrder(
      initialSlots,
      [
        event(1, EventType.SUBSTITUTION, {
          inPlayerId: 'p4',
          substitutionType: SubstitutionType.LINEUP_EXTENSION,
          battingOrderPosition: 4,
        }),
        event(2, EventType.SUBSTITUTION, {
          substitutionType: SubstitutionType.LINEUP_CONTRACTION,
          outPlayerId: 'p2',
          battingOrderPosition: 2,
        }),
      ],
      { batsOnTop: false },
    );

    expect(state.slots).toEqual([
      { playerId: 'p1', battingOrder: 1 },
      { playerId: 'p3', battingOrder: 3 },
      { playerId: 'p4', battingOrder: 4 },
    ]);
  });

  it('applies contraction to the opponent order without applying our team changes', () => {
    const state = deriveActiveBattingOrder(
      initialSlots,
      [
        event(1, EventType.SUBSTITUTION, {
          substitutionType: SubstitutionType.LINEUP_CONTRACTION,
          outPlayerId: 'p1',
          battingOrderPosition: 1,
          isOpponentSubstitution: false,
        }, true),
        event(2, EventType.SUBSTITUTION, {
          substitutionType: SubstitutionType.LINEUP_CONTRACTION,
          outPlayerId: 'p2',
          battingOrderPosition: 2,
          isOpponentSubstitution: true,
        }, true),
      ],
      { batsOnTop: true, forOpponent: true },
    );

    expect(state.slots).toEqual([
      { playerId: 'p1', battingOrder: 1 },
      { playerId: 'p3', battingOrder: 3 },
    ]);
  });

  it('ignores a lineup change removed by pitch undo or an event void', () => {
    const extension = event(2, EventType.SUBSTITUTION, {
      inPlayerId: 'p4',
      substitutionType: SubstitutionType.LINEUP_EXTENSION,
      battingOrderPosition: 4,
    }, false, 'extension');
    const events = [
      event(1, EventType.GAME_START),
      extension,
      event(3, EventType.PITCH_REVERTED, { revertToSequenceNumber: 1 }),
      event(4, 'event_voided', { voidedEventId: 'extension', voidedSequenceNumber: 2 }),
    ];

    const state = deriveActiveBattingOrder(initialSlots, events, { batsOnTop: false });
    expect(state.slots).toEqual(initialSlots);
  });

  it('rejects removing the active batter, an active runner, or changing mid-plate appearance', () => {
    const settings = defaultLeagueScoringSettings();
    settings.lineup.allowMidGameContraction = true;
    const target = initialSlots[1];

    expect(validateLineupContraction({
      slot: target,
      settings,
      currentBatterId: 'p2',
      runnersOnBase: [],
      betweenPlateAppearances: true,
    })).toMatch(/active batter/);
    expect(validateLineupContraction({
      slot: target,
      settings,
      currentBatterId: 'p1',
      runnersOnBase: ['p2'],
      betweenPlateAppearances: true,
    })).toMatch(/on base/);
    expect(validateLineupContraction({
      slot: target,
      settings,
      currentBatterId: 'p1',
      runnersOnBase: [],
      betweenPlateAppearances: false,
    })).toMatch(/between plate appearances/);
  });
});
