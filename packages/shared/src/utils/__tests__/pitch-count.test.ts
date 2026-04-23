import {
  countPitches,
  getRequiredRestDays,
  getEligibleDate,
  getPitchComplianceStatus,
} from '../pitch-count';
import { EventType, PitchOutcome, type GameEvent } from '../../types/game-event';
import type { PitchComplianceRule } from '../../types/compliance';

let seq = 0;
const mkPitch = (pitcherId: string | undefined, opts: { opponent?: boolean } = {}): GameEvent => ({
  id: `evt-${seq}`,
  gameId: 'g1',
  sequenceNumber: seq++,
  eventType: EventType.PITCH_THROWN,
  inning: 1,
  isTopOfInning: true,
  payload: opts.opponent
    ? { opponentPitcherId: pitcherId, batterId: 'b1', outcome: PitchOutcome.BALL }
    : { pitcherId, batterId: 'b1', outcome: PitchOutcome.BALL },
  occurredAt: new Date(2026, 0, 1, 12, 0, seq).toISOString(),
  createdBy: 'user-1',
  deviceId: 'dev-1',
});
const mkOther = (eventType: EventType, payload: Record<string, unknown>): GameEvent => ({
  id: `evt-${seq}`,
  gameId: 'g1',
  sequenceNumber: seq++,
  eventType,
  inning: 1,
  isTopOfInning: true,
  payload,
  occurredAt: new Date(2026, 0, 1, 12, 0, seq).toISOString(),
  createdBy: 'user-1',
  deviceId: 'dev-1',
});
const resetSeq = () => { seq = 0; };

describe('countPitches', () => {
  beforeEach(resetSeq);

  it('counts only pitches thrown by the requested pitcher', () => {
    const events: GameEvent[] = [
      mkPitch('pit1'),
      mkPitch('pit2'),
      mkPitch('pit1'),
      mkPitch('pit1'),
    ];
    expect(countPitches(events, 'pit1')).toBe(3);
    expect(countPitches(events, 'pit2')).toBe(1);
  });

  it('ignores non-PITCH_THROWN events even if they contain a pitcherId in their payload', () => {
    const events: GameEvent[] = [
      mkPitch('pit1'),
      mkOther(EventType.STRIKEOUT, { pitcherId: 'pit1', batterId: 'b1' }),
      mkOther(EventType.WALK, { pitcherId: 'pit1', batterId: 'b1' }),
    ];
    expect(countPitches(events, 'pit1')).toBe(1);
  });

  it('returns 0 when no pitches match the pitcherId', () => {
    const events: GameEvent[] = [mkPitch('pit1'), mkPitch('pit2')];
    expect(countPitches(events, 'not-a-pitcher')).toBe(0);
  });

  it("does not match pitches recorded under opponentPitcherId (compliance is own-team only)", () => {
    const events: GameEvent[] = [
      mkPitch('opp-pit', { opponent: true }),
      mkPitch('opp-pit', { opponent: true }),
    ];
    expect(countPitches(events, 'opp-pit')).toBe(0);
  });

  it("does not match the legacy 'unknown-pitcher' stub when a real pitcherId is queried", () => {
    const events: GameEvent[] = [
      mkPitch('unknown-pitcher'),
      mkPitch('unknown-pitcher'),
      mkPitch('pit1'),
    ];
    expect(countPitches(events, 'pit1')).toBe(1);
  });

  it('returns 0 for an empty event array', () => {
    expect(countPitches([], 'pit1')).toBe(0);
  });
});

// NFHS-style rule, arbitrarily chosen for testing
const NFHS_LIKE_RULE: PitchComplianceRule = {
  id: 'rule-1',
  ruleName: 'nfhs-test',
  maxPitchesPerDay: 105,
  restDayThresholds: {
    '1': 0,
    '31': 1,
    '46': 2,
    '61': 3,
    '76': 4,
  },
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('getRequiredRestDays', () => {
  it('returns 0 for zero pitches', () => {
    expect(getRequiredRestDays(0, NFHS_LIKE_RULE)).toBe(0);
  });

  it('returns correct rest at each band boundary', () => {
    expect(getRequiredRestDays(1, NFHS_LIKE_RULE)).toBe(0);
    expect(getRequiredRestDays(30, NFHS_LIKE_RULE)).toBe(0);
    expect(getRequiredRestDays(31, NFHS_LIKE_RULE)).toBe(1);
    expect(getRequiredRestDays(45, NFHS_LIKE_RULE)).toBe(1);
    expect(getRequiredRestDays(46, NFHS_LIKE_RULE)).toBe(2);
    expect(getRequiredRestDays(61, NFHS_LIKE_RULE)).toBe(3);
    expect(getRequiredRestDays(80, NFHS_LIKE_RULE)).toBe(4);
    expect(getRequiredRestDays(200, NFHS_LIKE_RULE)).toBe(4);
  });
});

describe('getEligibleDate', () => {
  it('adds rest days + 1 (next eligible game) to the game date', () => {
    // 3 rest days → eligible 4 days later
    expect(getEligibleDate('2026-04-23', 3)).toBe('2026-04-27');
  });

  it('returns the next day when rest is 0', () => {
    expect(getEligibleDate('2026-04-23', 0)).toBe('2026-04-24');
  });
});

describe('getPitchComplianceStatus', () => {
  it('flags at-warning below the danger threshold', () => {
    const status = getPitchComplianceStatus('pit1', 79, NFHS_LIKE_RULE, '2026-04-23');
    // 79/105 ≈ 0.752 → warning
    expect(status.isAtWarning).toBe(true);
    expect(status.isAtLimit).toBe(false);
    expect(status.isOverLimit).toBe(false);
  });

  it('flags at-limit when at/above the danger threshold but at/below max', () => {
    const status = getPitchComplianceStatus('pit1', 100, NFHS_LIKE_RULE, '2026-04-23');
    // 100/105 ≈ 0.95 → danger
    expect(status.isAtLimit).toBe(true);
    expect(status.isOverLimit).toBe(false);
  });

  it('flags over-limit when pitch count exceeds max', () => {
    const status = getPitchComplianceStatus('pit1', 106, NFHS_LIKE_RULE, '2026-04-23');
    expect(status.isOverLimit).toBe(true);
  });

  it('populates requiredRestDays and eligibleDate from the rule', () => {
    const status = getPitchComplianceStatus('pit1', 62, NFHS_LIKE_RULE, '2026-04-23');
    expect(status.requiredRestDays).toBe(3);
    expect(status.eligibleDate).toBe('2026-04-27');
  });
});
