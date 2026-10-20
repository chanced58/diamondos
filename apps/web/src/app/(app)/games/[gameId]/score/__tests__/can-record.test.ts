import { canRecordPlay } from '../can-record';

const base = {
  activeBatterId: 'batter',
  activePitcherId: 'pitcher',
  opponentTracked: true,
  opponentSlotSkipped: false,
};

describe('canRecordPlay', () => {
  it('should allow recording when batter and pitcher are both known', () => {
    expect(canRecordPlay({ ...base, isOpponentBatting: true })).toBe(true);
    expect(canRecordPlay({ ...base, isOpponentBatting: false })).toBe(true);
  });

  it('should allow an untracked opponent to bat without a batter, as mobile records it', () => {
    expect(canRecordPlay({ ...base, isOpponentBatting: true, activeBatterId: null, opponentTracked: false })).toBe(true);
  });

  it('should allow our batter to face an untracked opponent without a known pitcher', () => {
    expect(canRecordPlay({ ...base, isOpponentBatting: false, activePitcherId: null, opponentTracked: false })).toBe(true);
  });

  it('should still require our pitcher while an untracked opponent bats', () => {
    expect(canRecordPlay({ ...base, isOpponentBatting: true, activePitcherId: null, opponentTracked: false })).toBe(false);
  });

  it('should still require our batter when we are batting', () => {
    expect(canRecordPlay({ ...base, isOpponentBatting: false, activeBatterId: null, opponentTracked: false })).toBe(false);
  });

  it('should require a tracked opponent batter unless the slot was skipped', () => {
    const vacantSlot = { ...base, isOpponentBatting: true, activeBatterId: null };
    expect(canRecordPlay(vacantSlot)).toBe(false);
    expect(canRecordPlay({ ...vacantSlot, opponentSlotSkipped: true })).toBe(true);
  });

  it('should require a tracked opponent pitcher', () => {
    expect(canRecordPlay({ ...base, isOpponentBatting: false, activePitcherId: null })).toBe(false);
  });
});
