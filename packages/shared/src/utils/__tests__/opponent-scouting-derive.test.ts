import { EventType, PitchOutcome, PitchType } from '../../types/game-event';
import type { GameEvent } from '../../types/game-event';
import type { OpponentPlayer } from '../../types/opponent';
import { BatsThrows, PlayerPosition } from '../../types/player';
import { OpponentScoutingCategory } from '../../types/scouting-tag';
import { deriveOpponentTendencies } from '../opponent-scouting-derive';

function pitch(overrides: { pitchType?: PitchType; seq: number }): GameEvent {
  return {
    id: `evt-${overrides.seq}`,
    gameId: 'g-1',
    sequenceNumber: overrides.seq,
    eventType: EventType.PITCH_THROWN,
    inning: 1,
    isTopOfInning: false,
    payload: { outcome: PitchOutcome.BALL, pitchType: overrides.pitchType, opponentPitcherId: 'op-1' },
    occurredAt: '2026-04-20T18:00:00Z',
    createdBy: 'u-1',
    deviceId: 'd-1',
  };
}

function pitcher(overrides: Partial<OpponentPlayer> & { id: string; throws?: BatsThrows }): OpponentPlayer {
  return {
    opponentTeamId: 'opp-1',
    firstName: 'First',
    lastName: 'Last',
    primaryPosition: PlayerPosition.PITCHER,
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

describe('deriveOpponentTendencies — pitch mix', () => {
  it('emits a tag for each pitch type with ≥ 15% share once sample ≥ min', () => {
    const events: GameEvent[] = [];
    // 15 sliders + 10 fastballs = 25 pitches. Each shares > 15%.
    for (let i = 0; i < 15; i++) events.push(pitch({ pitchType: PitchType.SLIDER, seq: i + 1 }));
    for (let i = 0; i < 10; i++) events.push(pitch({ pitchType: PitchType.FASTBALL, seq: 16 + i }));

    const tags = deriveOpponentTendencies(events, []);
    const mixTags = tags.filter((t) => t.category === OpponentScoutingCategory.PITCH_MIX);
    expect(mixTags.map((t) => t.tagValue).sort()).toEqual([PitchType.FASTBALL, PitchType.SLIDER]);
  });

  it('returns no pitch-mix tags below the sample threshold', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(pitch({ pitchType: PitchType.CURVEBALL, seq: i + 1 }));
    const tags = deriveOpponentTendencies(events, []);
    expect(tags.filter((t) => t.category === OpponentScoutingCategory.PITCH_MIX)).toHaveLength(0);
  });

  it('ignores pitches without pitchType', () => {
    const events: GameEvent[] = [];
    for (let i = 0; i < 25; i++) events.push(pitch({ seq: i + 1 })); // undefined pitchType
    const tags = deriveOpponentTendencies(events, []);
    expect(tags.filter((t) => t.category === OpponentScoutingCategory.PITCH_MIX)).toHaveLength(0);
  });
});

describe('deriveOpponentTendencies — pitcher handedness', () => {
  it('flags lefty-heavy rosters (≥ 30% LHP)', () => {
    const roster: OpponentPlayer[] = [
      pitcher({ id: 'p1', throws: BatsThrows.LEFT }),
      pitcher({ id: 'p2', throws: BatsThrows.LEFT }),
      pitcher({ id: 'p3', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'p4', throws: BatsThrows.RIGHT }),
    ];
    const tags = deriveOpponentTendencies([], roster);
    const handedness = tags.find((t) => t.category === OpponentScoutingCategory.PITCHER_HANDEDNESS);
    expect(handedness?.tagValue).toBe('lefty_heavy');
  });

  it('flags righty-only rosters (≤ 10% LHP)', () => {
    const roster: OpponentPlayer[] = [
      pitcher({ id: 'p1', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'p2', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'p3', throws: BatsThrows.RIGHT }),
    ];
    const tags = deriveOpponentTendencies([], roster);
    const handedness = tags.find((t) => t.category === OpponentScoutingCategory.PITCHER_HANDEDNESS);
    expect(handedness?.tagValue).toBe('righty_only');
  });

  it('emits no handedness tag for a balanced staff', () => {
    const roster: OpponentPlayer[] = [
      pitcher({ id: 'p1', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'p2', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'p3', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'p4', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'p5', throws: BatsThrows.LEFT }), // 20% LHP
    ];
    const tags = deriveOpponentTendencies([], roster);
    expect(tags.filter((t) => t.category === OpponentScoutingCategory.PITCHER_HANDEDNESS)).toHaveLength(0);
  });

  it('ignores inactive pitchers', () => {
    // 3 active right-handed pitchers (meets the handedness min-sample) and
    // 2 inactive left-handed pitchers. If the filter were broken, the ratio
    // would be 2/5 = 40% LHP → "lefty_heavy". When working, only active R's
    // are counted → "righty_only".
    const roster: OpponentPlayer[] = [
      pitcher({ id: 'r1', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'r2', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'r3', throws: BatsThrows.RIGHT }),
      pitcher({ id: 'l1-inactive', throws: BatsThrows.LEFT, isActive: false }),
      pitcher({ id: 'l2-inactive', throws: BatsThrows.LEFT, isActive: false }),
    ];
    const tags = deriveOpponentTendencies([], roster);
    const handedness = tags.find((t) => t.category === OpponentScoutingCategory.PITCHER_HANDEDNESS);
    expect(handedness?.tagValue).toBe('righty_only');
  });
});

describe('deriveOpponentTendencies — empty inputs', () => {
  it('returns [] when both sides are empty', () => {
    expect(deriveOpponentTendencies([], [])).toEqual([]);
  });
});
