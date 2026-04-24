import { computeOpponentBatting } from '../opponent-batting-stats';

const GAME = 'g1';
let seq = 0;
const e = (event_type: string, payload: Record<string, unknown>) => ({
  game_id: GAME,
  sequence_number: seq++,
  event_type,
  payload,
});
const resetSeq = () => { seq = 0; };

const oppMap = new Map<string, string>([
  ['opp1', 'Oliver Opponent'],
  ['opp2', 'Olivia Otherteam'],
  ['opp3', 'Otto Outfielder'],
  ['opp4', 'Owen Overthere'],
]);

describe('computeOpponentBatting — stub rejection', () => {
  beforeEach(resetSeq);

  it("refuses to accumulate stats under the 'unknown-batter' stub even when it appears as opponentBatterId", () => {
    const events = [
      e('hit',  { opponentBatterId: 'unknown-batter', hitType: 'single' }),
      e('walk', { opponentBatterId: 'unknown-batter' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    expect(rows.find((r) => r.playerId === 'unknown-batter')).toBeUndefined();
  });

  it("rejects 'unknown-batter' when it appears in the fallback batterId field", () => {
    const events = [
      e('hit', { batterId: 'unknown-batter', hitType: 'single' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    expect(rows.find((r) => r.playerId === 'unknown-batter')).toBeUndefined();
  });

  it('still attributes a real opponent batter correctly', () => {
    const events = [
      e('hit',  { opponentBatterId: 'opp1', hitType: 'single' }),
      e('walk', { opponentBatterId: 'opp1' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    const row = rows.find((r) => r.playerId === 'opp1');
    expect(row).toBeDefined();
    expect(row!.pa).toBe(2);
    expect(row!.h).toBe(1);
    expect(row!.bb).toBe(1);
  });
});

describe('computeOpponentBatting — PA outcome coverage', () => {
  beforeEach(resetSeq);

  it('counts each hit type increment correctly', () => {
    const events = [
      e('hit', { opponentBatterId: 'opp1', hitType: 'single' }),
      e('hit', { opponentBatterId: 'opp2', hitType: 'double' }),
      e('hit', { opponentBatterId: 'opp3', hitType: 'triple' }),
      e('hit', { opponentBatterId: 'opp4', hitType: 'home_run' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    expect(rows.find((r) => r.playerId === 'opp1')!.h).toBe(1);
    expect(rows.find((r) => r.playerId === 'opp2')!.doubles).toBe(1);
    expect(rows.find((r) => r.playerId === 'opp3')!.triples).toBe(1);
    expect(rows.find((r) => r.playerId === 'opp4')!.hr).toBe(1);
    expect(rows.every((r) => r.ab === 1)).toBe(true);
  });

  it('credits 4 RBI for a grand slam (bases loaded via 3 singles)', () => {
    const events = [
      e('hit', { opponentBatterId: 'opp1', hitType: 'single' }), // r1=opp1
      e('hit', { opponentBatterId: 'opp2', hitType: 'single' }), // r2=opp1, r1=opp2
      e('hit', { opponentBatterId: 'opp3', hitType: 'single' }), // r3=opp1, r2=opp2, r1=opp3
      e('hit', { opponentBatterId: 'opp4', hitType: 'home_run' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    const opp4 = rows.find((r) => r.playerId === 'opp4')!;
    expect(opp4.hr).toBe(1);
    expect(opp4.rbi).toBe(4);
  });

  it('credits walk PAs with bases-loaded RBI auto-derivation', () => {
    const events = [
      e('walk', { opponentBatterId: 'opp1' }), // r1
      e('walk', { opponentBatterId: 'opp2' }), // r2
      e('walk', { opponentBatterId: 'opp3' }), // r3 loaded
      e('walk', { opponentBatterId: 'opp4' }), // bases-loaded walk forces RBI
    ];
    const rows = computeOpponentBatting(events, oppMap);
    const opp4 = rows.find((r) => r.playerId === 'opp4')!;
    expect(opp4.bb).toBe(1);
    expect(opp4.rbi).toBe(1);
    // No AB on any of the walks
    expect(rows.every((r) => r.ab === 0)).toBe(true);
  });

  it('counts HBP as PA but not AB, with forced-run RBI when bases loaded', () => {
    const events = [
      e('walk', { opponentBatterId: 'opp1' }),
      e('walk', { opponentBatterId: 'opp2' }),
      e('walk', { opponentBatterId: 'opp3' }),
      e('hit_by_pitch', { opponentBatterId: 'opp4' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    const opp4 = rows.find((r) => r.playerId === 'opp4')!;
    expect(opp4.pa).toBe(1);
    expect(opp4.ab).toBe(0);
    expect(opp4.hbp).toBe(1);
    expect(opp4.rbi).toBe(1);
  });

  it('counts catcher interference as PA but not AB', () => {
    const events = [e('catcher_interference', { opponentBatterId: 'opp1' })];
    const rows = computeOpponentBatting(events, oppMap);
    const opp1 = rows.find((r) => r.playerId === 'opp1')!;
    expect(opp1.pa).toBe(1);
    expect(opp1.ab).toBe(0);
  });

  it('counts sacrifice fly as PA + SF, not AB; scores runner from 3rd', () => {
    const events = [
      e('hit', { opponentBatterId: 'opp1', hitType: 'triple' }),
      e('sacrifice_fly', { opponentBatterId: 'opp2' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    const opp1 = rows.find((r) => r.playerId === 'opp1')!;
    const opp2 = rows.find((r) => r.playerId === 'opp2')!;
    expect(opp2.pa).toBe(1);
    expect(opp2.ab).toBe(0);
    expect(opp2.sf).toBe(1);
    expect(opp2.rbi).toBe(1);
    expect(opp1.r).toBe(1); // runner from 3rd scored
  });

  it('counts strikeout PAs via explicit STRIKEOUT and OUT-with-outType-strikeout', () => {
    const events = [
      e('strikeout', { opponentBatterId: 'opp1' }),
      e('out', { opponentBatterId: 'opp2', outType: 'strikeout' }),
      e('out', { opponentBatterId: 'opp3', outType: 'groundout' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    expect(rows.find((r) => r.playerId === 'opp1')!.k).toBe(1);
    expect(rows.find((r) => r.playerId === 'opp2')!.k).toBe(1);
    expect(rows.find((r) => r.playerId === 'opp3')!.k).toBe(0); // non-K out
    // All are AB
    expect(rows.every((r) => r.ab === 1)).toBe(true);
  });

  it('counts double_play and triple_play as at-bats', () => {
    const events = [
      e('double_play', { opponentBatterId: 'opp1' }),
      e('triple_play', { opponentBatterId: 'opp2' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    expect(rows.find((r) => r.playerId === 'opp1')!.ab).toBe(1);
    expect(rows.find((r) => r.playerId === 'opp2')!.ab).toBe(1);
  });

  it('credits stolen bases and caught stealing to the runner, not a batter', () => {
    const events = [
      e('hit', { opponentBatterId: 'opp1', hitType: 'single' }),
      e('stolen_base', { runnerId: 'opp1', fromBase: 1, toBase: 2 }),
      e('caught_stealing', { runnerId: 'opp1', fromBase: 2, toBase: 3 }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    const opp1 = rows.find((r) => r.playerId === 'opp1')!;
    expect(opp1.sb).toBe(1);
    expect(opp1.cs).toBe(1);
  });

  it('clears bases on inning_change so runners do not bleed across innings', () => {
    const events = [
      e('hit', { opponentBatterId: 'opp1', hitType: 'triple' }),
      e('inning_change', {}),
      e('hit', { opponentBatterId: 'opp2', hitType: 'single' }),
    ];
    const rows = computeOpponentBatting(events, oppMap);
    // opp1 reached 3rd but inning ended before a run could score
    expect(rows.find((r) => r.playerId === 'opp1')!.r).toBe(0);
    expect(rows.find((r) => r.playerId === 'opp2')!.rbi).toBe(0);
  });
});
