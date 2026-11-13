import { describeSyncError, toSyncError } from '../sync-error';

describe('describeSyncError', () => {
  it('should describe a PostgREST error object instead of printing [object Object]', () => {
    const error = {
      message: 'new row violates row-level security policy for table "players"',
      code: '42501',
      details: null,
      hint: null,
    };
    expect(describeSyncError(error)).toBe(
      'new row violates row-level security policy for table "players" (code 42501)',
    );
  });

  it('should keep the details and hint when the server sends them', () => {
    expect(describeSyncError({ message: 'insert failed', code: '23503', details: 'Key (player_id)=(p-1) is not present', hint: 'add the player first' }))
      .toBe('insert failed (code 23503) details: Key (player_id)=(p-1) is not present hint: add the player first');
  });

  it('should use an Error\'s message', () => {
    expect(describeSyncError(new Error('network request failed'))).toBe('network request failed');
  });

  it('should pass a string through', () => {
    expect(describeSyncError('REPLACE_LINEUP_NOT_AUTHORIZED')).toBe('REPLACE_LINEUP_NOT_AUTHORIZED');
  });

  it('should serialize an object with no message fields', () => {
    expect(describeSyncError({ status: 500 })).toBe('{"status":500}');
  });

  it('should fall back to String for values that are not objects', () => {
    expect(describeSyncError(undefined)).toBe('undefined');
    expect(describeSyncError(42)).toBe('42');
  });

  it('should not throw on a circular object', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeSyncError(circular)).toBe('[object Object]');
  });
});

describe('toSyncError', () => {
  it('should return an Error with a readable message for a PostgREST error object', () => {
    const error = toSyncError({ message: 'not authorized to start this game', code: 'P0001' });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('not authorized to start this game (code P0001)');
  });

  it('should return an Error unchanged', () => {
    const original = new Error('boom');
    expect(toSyncError(original)).toBe(original);
  });
});
