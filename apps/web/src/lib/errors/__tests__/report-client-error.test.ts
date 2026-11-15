import { reportClientError } from '../report-client-error';

describe('reportClientError', () => {
  const fetchMock = jest.fn((..._args: unknown[]) => Promise.resolve(new Response(null, { status: 204 })));
  beforeEach(() => {
    fetchMock.mockClear();
    (global as { fetch: unknown }).fetch = fetchMock;
  });

  it('sends a placeholder when the error has no message', () => {
    reportClientError('render', new Error(''));
    const init = fetchMock.mock.calls[0][1] as unknown as { body: string };
    expect(JSON.parse(init.body).entries[0].message).toBe('[no message]');
  });

  it('sends the error message when present', () => {
    reportClientError('render', new Error('boom'));
    const init = fetchMock.mock.calls[0][1] as unknown as { body: string };
    expect(JSON.parse(init.body).entries[0].message).toBe('boom');
  });
});
