import { buildSideIdMaps, translateBookForSide } from '../league-game-book';
import { deriveBattingStats } from '../batting-stats';

const maps = buildSideIdMaps({
  scoringTeamPlayerIds: ['a-1', 'a-2'],
  rosterRecordPlayers: [
    { id: 'opp-7', linkedPlayerId: 'p-7', isPlaceholder: false, isFillIn: false },
    { id: 'opp-99', linkedPlayerId: null, isPlaceholder: true, isFillIn: false },
  ],
  reverseLinks: new Map([['a-1', 'opp-a1']]),
});

const row = (event_type: string, payload: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  game_id: 'g1',
  sequence_number: 1,
  event_type,
  inning: 1,
  is_top_of_inning: true,
  payload,
  ...extra,
});

describe('translateBookForSide', () => {
  it("should put the other team's linked players under batterId when translating for that team", () => {
    const [out] = translateBookForSide(
      [row('hit', { opponentBatterId: 'opp-7', hitType: 'single' })],
      maps.otherSide,
    );
    const payload = out.payload as Record<string, unknown>;
    expect(payload.batterId).toBe('p-7');
    expect(payload).not.toHaveProperty('opponentBatterId');
  });

  it('should attribute by roster membership when the web scorer stored opponent ids under batterId', () => {
    const events = [row('hit', { batterId: 'opp-7', hitType: 'single' })];
    const [other] = translateBookForSide(events, maps.otherSide);
    expect((other.payload as Record<string, unknown>).batterId).toBe('p-7');
    const [scoring] = translateBookForSide(events, maps.scoringSide);
    const payload = scoring.payload as Record<string, unknown>;
    expect(payload.opponentBatterId).toBe('opp-7');
    expect(payload).not.toHaveProperty('batterId');
  });

  it('should map an unmatched placeholder to a placeholder id on its own side', () => {
    const [out] = translateBookForSide([row('walk', { opponentBatterId: 'opp-99' })], maps.otherSide);
    expect((out.payload as Record<string, unknown>).batterId).toBe('placeholder:opp-99');
  });

  it("should map the scoring team's players to their roster-record ids for the other side's opponent keys", () => {
    const [out] = translateBookForSide([row('out', { pitcherId: 'a-1' })], maps.otherSide);
    const payload = out.payload as Record<string, unknown>;
    expect(payload.opponentPitcherId).toBe('opp-a1');
    expect(payload).not.toHaveProperty('pitcherId');
  });

  it('should replace ids nested in arrays such as fieldingSequence', () => {
    const [out] = translateBookForSide(
      [row('out', { opponentBatterId: 'opp-7', fieldingSequence: ['a-1', 'a-2'], runners: [{ id: 'opp-7' }] })],
      maps.otherSide,
    );
    const payload = out.payload as Record<string, unknown>;
    expect(payload.fieldingSequence).toEqual(['opp-a1', 'a-2']);
    expect(payload.runners).toEqual([{ id: 'p-7' }]);
  });

  it('should leave non-payload fields untouched', () => {
    const [out] = translateBookForSide([row('walk', { opponentBatterId: 'opp-7' }, { id: 'e1' })], maps.otherSide);
    expect(out).toMatchObject({ id: 'e1', game_id: 'g1', inning: 1, is_top_of_inning: true });
  });

  it('should not mutate the input events', () => {
    const events = [row('out', { opponentBatterId: 'opp-7', fieldingSequence: ['a-1'] })];
    const snapshot = JSON.parse(JSON.stringify(events));
    translateBookForSide(events, maps.otherSide);
    expect(events).toEqual(snapshot);
  });

  it("should credit the other team's batter in deriveBattingStats after translation", () => {
    const events = [row('hit', { opponentBatterId: 'opp-7', hitType: 'single' })];
    const translated = translateBookForSide(events, maps.otherSide);
    const stats = deriveBattingStats(
      translated as never,
      [{ id: 'p-7', firstName: 'Pat', lastName: 'Seven' }],
    );
    expect(stats.get('p-7')?.hits).toBe(1);
  });
});
