import { postLeagueMessage } from '../league-messaging-api';

const mockInsert = jest.fn();
jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({ from: () => ({ insert: (row: unknown) => mockInsert(row) }) }),
}));

describe('postLeagueMessage', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should insert the message as the sender', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await postLeagueMessage('lc-1', 'me', 'Rain delay');
    expect(mockInsert).toHaveBeenCalledWith({ league_channel_id: 'lc-1', sender_id: 'me', body: 'Rain delay' });
  });

  it('should log the database error with the channel before throwing it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = { code: '42P17', message: 'infinite recursion detected in policy' };
    mockInsert.mockResolvedValue({ error });

    await expect(postLeagueMessage('lc-1', 'me', 'Rain delay')).rejects.toBe(error);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('channel=lc-1'), error);
  });
});
