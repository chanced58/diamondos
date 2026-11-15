import { resolveAppOrigin } from '../app-url';

const mockReportError = jest.fn();
jest.mock('@/lib/errors/report-error', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

const env = process.env as Record<string, string | undefined>;
const saved = { ...env };

beforeEach(() => {
  jest.clearAllMocks();
  delete env.NEXT_PUBLIC_APP_URL;
  delete env.APP_URL;
});
afterEach(() => {
  for (const key of ['NEXT_PUBLIC_APP_URL', 'APP_URL', 'NODE_ENV']) {
    if (saved[key] === undefined) delete env[key];
    else env[key] = saved[key];
  }
});

describe('resolveAppOrigin', () => {
  it('should return the normalized NEXT_PUBLIC_APP_URL', () => {
    env.NEXT_PUBLIC_APP_URL = 'https://www.diamondos.app/auth/callback/';
    expect(resolveAppOrigin()).toBe('https://www.diamondos.app');
  });

  it('should fall back to APP_URL', () => {
    env.APP_URL = 'https://app.example.com/';
    expect(resolveAppOrigin()).toBe('https://app.example.com');
  });

  it('should use localhost outside production', () => {
    env.NODE_ENV = 'development';
    expect(resolveAppOrigin()).toBe('http://localhost:3001');
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('should return null and report once in production with no address', () => {
    env.NODE_ENV = 'production';
    expect(resolveAppOrigin()).toBeNull();
    expect(mockReportError).toHaveBeenCalledTimes(1);
    expect(mockReportError).toHaveBeenCalledWith('config', 'NEXT_PUBLIC_APP_URL is not set');
  });
});
