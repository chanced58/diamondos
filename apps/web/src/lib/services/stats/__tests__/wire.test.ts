import { derivePitchingStats, EventType, PitchOutcome, type GameEvent } from '@baseball/shared';
import { toPitchingRow } from '../wire';

/** One inning: a walk and three strikeouts by p1. */
function oneInning(): GameEvent[] {
  let seq = 0;
  const e = (event_type: string, payload: Record<string, unknown>) =>
    ({ game_id: 'g1', sequence_number: seq++, event_type, payload, is_top_of_inning: true }) as unknown as GameEvent;
  const strikeout = (batterId: string) => [
    e(EventType.PITCH_THROWN, { pitcherId: 'p1', batterId, outcome: PitchOutcome.SWINGING_STRIKE }),
    e(EventType.STRIKEOUT, { pitcherId: 'p1', batterId }),
  ];
  return [
    e(EventType.GAME_START, { homeLineupPitcherId: 'p1' }),
    e(EventType.PITCH_THROWN, { pitcherId: 'p1', batterId: 'b1', outcome: PitchOutcome.BALL }),
    e(EventType.WALK, { pitcherId: 'p1', batterId: 'b1' }),
    ...strikeout('b2'),
    ...strikeout('b3'),
    ...strikeout('b4'),
  ];
}

const players = [{ id: 'p1', firstName: 'Pat', lastName: 'Arm' }];

describe('toPitchingRow', () => {
  it('should keep K/7 and BB/7 per 7 innings for older app builds in a nine-inning league', () => {
    const line = derivePitchingStats(oneInning(), players, 9).get('p1')!;
    const row = toPitchingRow(line);
    expect(row.strikeoutsPerSeven).toBeCloseTo(21);
    expect(row.walksPerSeven).toBeCloseTo(7);
    expect(row.strikeoutsPerGame).toBeCloseTo(27);
    expect(row.walksPerGame).toBeCloseTo(9);
  });

  it('should send the same per-7 values in both fields for a seven-inning league', () => {
    const row = toPitchingRow(derivePitchingStats(oneInning(), players).get('p1')!);
    expect(row.strikeoutsPerSeven).toBeCloseTo(21);
    expect(row.strikeoutsPerGame).toBeCloseTo(21);
  });

  it('should send rates that cannot be computed as null', () => {
    const line = { ...derivePitchingStats(oneInning(), players, 9).get('p1')!, inningsPitchedOuts: 0, era: Infinity };
    const row = toPitchingRow(line);
    expect(row.era).toBeNull();
  });
});
