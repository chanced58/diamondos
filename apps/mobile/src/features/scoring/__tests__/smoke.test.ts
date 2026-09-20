import { EventType } from '@baseball/shared';

describe('mobile test harness', () => {
  it('resolves @baseball/shared from a mobile test', () => {
    expect(EventType.PITCH_THROWN).toBe('pitch_thrown');
  });
});
