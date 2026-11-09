import type { SupabaseClient } from '@supabase/supabase-js';
import { sendPush } from '../send-push';

function dbWith(invoke: jest.Mock): SupabaseClient {
  return { functions: { invoke } } as unknown as SupabaseClient;
}

const input = { userIds: ['u1', 'u2'], title: 'Title', body: 'Body', data: { kind: 'game', gameId: 'g1' } };

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  errorSpy.mockRestore();
});

describe('sendPush', () => {
  it('should send the notification through the push-notifications edge function', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: null });
    await sendPush(dbWith(invoke), input);
    expect(invoke).toHaveBeenCalledWith('push-notifications', { body: input });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should not call the edge function when there is nobody to notify', async () => {
    const invoke = jest.fn();
    await sendPush(dbWith(invoke), { ...input, userIds: [] });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('should log a failed push without throwing', async () => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: new Error('edge down') });
    await expect(sendPush(dbWith(invoke), input)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[sendPush] push-notifications failed title="Title" users=2:', expect.any(Error));
  });

  it('should log a thrown push without throwing', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('network'));
    await expect(sendPush(dbWith(invoke), input)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[sendPush] push-notifications threw title="Title" users=2:', expect.any(Error));
  });
});
