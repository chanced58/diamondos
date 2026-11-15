import { POST } from '../route';

const mockGetUser = jest.fn();
const mockRecord = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({ auth: { getUser: () => mockGetUser() } }),
}));
jest.mock('@/lib/services/errors/record-client-errors', () => ({
  recordClientErrors: (...args: unknown[]) => mockRecord(...args),
}));

const request = () => new Request('https://example.com/api/client-errors', { method: 'POST', body: '{}' });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

describe('POST /api/client-errors', () => {
  it('answers 204 without writing when the session lookup throws', async () => {
    mockGetUser.mockRejectedValue(new Error('cookies unavailable'));
    expect((await POST(request())).status).toBe(204);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('answers 204 without writing for an anonymous caller', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(request())).status).toBe(204);
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it('answers 400 for invalid input from a signed-in user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockRecord.mockResolvedValue({ ok: false, code: 'invalid', error: 'bad' });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad', code: 'invalid' });
  });
});
