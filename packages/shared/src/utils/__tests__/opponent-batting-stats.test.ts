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
