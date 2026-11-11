import { eventSaveErrorMessage } from '../save-error-message';

describe('eventSaveErrorMessage', () => {
  it('should tell the scorer to fix the clock when the server refuses a future-dated event', () => {
    const error = { code: 'P0001', hint: 'device_clock_ahead', details: '1767225600000', message: 'game_events.occurred_at (...) is more than 24h ahead' };
    expect(eventSaveErrorMessage(error)).toMatch(/date and time are more than a day ahead/);
  });

  it('should keep the generic retry message for any other failure', () => {
    expect(eventSaveErrorMessage({ code: '42501', message: 'permission denied' })).toBe('Failed to save last action. Please try again.');
  });
});
