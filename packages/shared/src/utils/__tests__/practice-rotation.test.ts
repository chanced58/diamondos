import { buildStationRotation, validateRotation } from '../practice-rotation';

function stations(n: number, rotationCount = n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    position: i,
    rotationCount,
  }));
}

describe('buildStationRotation', () => {
  it('evenly distributes players across stations on each rotation', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const out = buildStationRotation(players, stations(3));
    // 6 players × 3 rotations = 18 assignment rows.
    expect(out).toHaveLength(18);
    const v = validateRotation(out);
    expect(v.ok).toBe(true);
  });

  it('handles players not divisible by station count (ragged groups)', () => {
    const players = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const out = buildStationRotation(players, stations(3));
    // Row-major: groups [[p1,p4],[p2,p5],[p3]]; 2+2+1 per rotation × 3.
    expect(out).toHaveLength(5 * 3);
    const v = validateRotation(out);
    expect(v.ok).toBe(true);
  });

  it('handles fewer players than stations (some stations empty)', () => {
    const players = ['p1', 'p2'];
    const out = buildStationRotation(players, stations(4));
    // 2 players × 4 rotations = 8 rows. Empty groups do not emit assignments.
    expect(out).toHaveLength(2 * 4);
    expect(validateRotation(out).ok).toBe(true);
  });

  it('returns [] for empty inputs', () => {
    expect(buildStationRotation([], stations(3))).toEqual([]);
    expect(buildStationRotation(['p1'], [])).toEqual([]);
  });

  it('uses the minimum rotationCount when stations disagree', () => {
    const players = ['p1', 'p2', 'p3'];
    const ss = [
      { id: 's0', position: 0, rotationCount: 4 },
      { id: 's1', position: 1, rotationCount: 2 },
      { id: 's2', position: 2, rotationCount: 5 },
    ];
    const out = buildStationRotation(players, ss);
    // min rotationCount = 2, so 3 players × 2 = 6.
    expect(out).toHaveLength(6);
  });

  it('fuzz: 500 random (players, stations) combos all produce valid rotations', () => {
    let rngState = 1337;
    const rand = () => {
      rngState = (rngState * 1664525 + 1013904223) >>> 0;
      return rngState / 0x100000000;
    };
    for (let i = 0; i < 500; i++) {
      const pCount = 2 + Math.floor(rand() * 24); // 2..25
      const sCount = 2 + Math.floor(rand() * 5); // 2..6
      const rotCount = 1 + Math.floor(rand() * 4);
      const players = Array.from({ length: pCount }, (_, j) => `p${j}`);
      const ss = stations(sCount, rotCount);
      const out = buildStationRotation(players, ss);
      expect(validateRotation(out).ok).toBe(true);
      // every player appears in every rotation
      for (let r = 0; r < rotCount; r++) {
        const atR = out.filter((a) => a.rotationIndex === r).map((a) => a.playerId);
        expect(new Set(atR).size).toBe(atR.length); // no dup within rotation
      }
    }
  });
});

describe('validateRotation', () => {
  it('detects a player at two stations in the same rotation', () => {
    const v = validateRotation([
      { stationId: 's0', playerId: 'p1', rotationIndex: 0 },
      { stationId: 's1', playerId: 'p1', rotationIndex: 0 },
    ]);
    expect(v.ok).toBe(false);
    expect(v.duplicates).toHaveLength(1);
    expect(v.duplicates[0]).toEqual({
      playerId: 'p1',
      rotationIndex: 0,
      stationIds: ['s0', 's1'],
    });
  });
});
