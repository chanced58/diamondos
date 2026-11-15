import { serviceResponse } from '../service-response';
import { reportError } from '@/lib/errors/report-error';

jest.mock('@/lib/errors/report-error', () => ({ reportError: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe('serviceResponse', () => {
  it('should report a failed result and still answer 500 Internal error', async () => {
    const res = serviceResponse({ ok: false, code: 'failed', error: 'relation x does not exist' });

    expect(reportError).toHaveBeenCalledWith('service.failed', 'relation x does not exist');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error', code: 'failed' });
  });

  it('should not report a client-caused failure', async () => {
    const res = serviceResponse({ ok: false, code: 'forbidden', error: 'nope' });

    expect(reportError).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('should not report a success', () => {
    const res = serviceResponse({ ok: true, data: { a: 1 } });

    expect(reportError).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});
