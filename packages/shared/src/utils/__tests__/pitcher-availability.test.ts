import type { PitchComplianceRule } from '../../types/compliance';
import type { Player } from '../../types/player';
import { PitcherAvailabilityStatus } from '../../types/pitcher-availability';
import {
  computePitcherAvailability,
  type PitchCountRecord,
} from '../pitcher-availability';

const NFHS: PitchComplianceRule = {
  id: 'rule-nfhs',
  ruleName: 'NFHS',
  maxPitchesPerDay: 110,
  restDayThresholds: { '31': 1, '46': 2, '61': 3, '76': 4 },
  isActive: true,
  createdAt: '2026-04-01T00:00:00Z',
};

function player(id: string): Player {
  return {
    id,
    firstName: 'A',
    lastName: 'B',
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
  };
}

describe('computePitcherAvailability', () => {
  const target = new Date('2026-04-22T18:00:00Z');

  it('marks pitchers with no history as available', () => {
    const out = computePitcherAvailability([player('p1')], [], NFHS, target);
    expect(out[0].status).toBe(PitcherAvailabilityStatus.AVAILABLE);
    expect(out[0].pitchesLast7d).toBe(0);
  });

  it('marks a pitcher unavailable when inside required rest window', () => {
    // Pitcher threw 85 pitches 2 days ago — NFHS requires 4 rest days.
    const counts: PitchCountRecord[] = [
      { playerId: 'p1', gameDate: '2026-04-20', pitchCount: 85 },
    ];
    const out = computePitcherAvailability([player('p1')], counts, NFHS, target);
    expect(out[0].status).toBe(PitcherAvailabilityStatus.UNAVAILABLE);
    expect(out[0].nextAvailableDate).toBe('2026-04-25');
  });

  it('marks a pitcher available when past rest window', () => {
    const counts: PitchCountRecord[] = [
      { playerId: 'p1', gameDate: '2026-04-10', pitchCount: 85 },
    ];
    const out = computePitcherAvailability([player('p1')], counts, NFHS, target);
    expect(out[0].status).toBe(PitcherAvailabilityStatus.AVAILABLE);
  });

  it('marks a pitcher LIMITED when recent-7d volume crosses 60% of daily cap', () => {
    // 70 pitches in last 7 days (< NFHS 110 cap) and last game > rest window.
    const counts: PitchCountRecord[] = [
      { playerId: 'p1', gameDate: '2026-04-17', pitchCount: 30 }, // 5 days ago; 1 rest day → clears 2026-04-19
      { playerId: 'p1', gameDate: '2026-04-19', pitchCount: 40 }, // 3 days ago; 1 rest day → clears 2026-04-21
    ];
    const out = computePitcherAvailability([player('p1')], counts, NFHS, target);
    expect(out[0].status).toBe(PitcherAvailabilityStatus.LIMITED);
    expect(out[0].pitchesLast7d).toBe(70);
  });

  it('reports lastPitchedAt as the most recent appearance', () => {
    const counts: PitchCountRecord[] = [
      { playerId: 'p1', gameDate: '2026-04-10', pitchCount: 100 },
      { playerId: 'p1', gameDate: '2026-04-21', pitchCount: 20 },
    ];
    const out = computePitcherAvailability([player('p1')], counts, NFHS, target);
    expect(out[0].lastPitchedAt).toBe('2026-04-21');
  });

  it('takes the MAX rest-end across recent outings, not just the most recent game', () => {
    // Heavy earlier outing: 85 pitches Sat Apr 18 → NFHS 4 rest days → clears Apr 23.
    // Light recent outing:   20 pitches Sun Apr 19 → NFHS 0 rest days → clears Apr 20.
    // Target: Apr 22. The earlier heavy outing still blocks availability.
    const counts: PitchCountRecord[] = [
      { playerId: 'p1', gameDate: '2026-04-18', pitchCount: 85 },
      { playerId: 'p1', gameDate: '2026-04-19', pitchCount: 20 },
    ];
    const out = computePitcherAvailability([player('p1')], counts, NFHS, target);
    expect(out[0].status).toBe(PitcherAvailabilityStatus.UNAVAILABLE);
    // Rest clears day after Apr 18 + 4 rest days = Apr 23.
    expect(out[0].nextAvailableDate).toBe('2026-04-23');
    // But lastPitchedAt still tracks the most recent game.
    expect(out[0].lastPitchedAt).toBe('2026-04-19');
    // The reason string names the blocking outing, not just the latest.
    expect(out[0].reason).toContain('2026-04-18');
  });

  it('handles multiple pitchers independently', () => {
    const counts: PitchCountRecord[] = [
      { playerId: 'p1', gameDate: '2026-04-21', pitchCount: 90 }, // unavail
      { playerId: 'p2', gameDate: '2026-04-10', pitchCount: 20 }, // available
    ];
    const out = computePitcherAvailability([player('p1'), player('p2')], counts, NFHS, target);
    expect(out.find((p) => p.playerId === 'p1')?.status).toBe(PitcherAvailabilityStatus.UNAVAILABLE);
    expect(out.find((p) => p.playerId === 'p2')?.status).toBe(PitcherAvailabilityStatus.AVAILABLE);
  });
});
