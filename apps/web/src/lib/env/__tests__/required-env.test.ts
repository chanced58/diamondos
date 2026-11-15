import { findMissingEnv, REQUIRED_ENV } from '../required-env';

const allPresent = Object.fromEntries(REQUIRED_ENV.map((name) => [name, 'value']));

describe('findMissingEnv', () => {
  it('returns an empty list when every name is set', () => {
    expect(findMissingEnv(allPresent, REQUIRED_ENV)).toEqual([]);
  });

  it('lists names that are unset or empty', () => {
    const env = { ...allPresent, CRON_SECRET: '', INTERNAL_JOB_SECRET: undefined };
    expect(findMissingEnv(env, REQUIRED_ENV)).toEqual(['CRON_SECRET', 'INTERNAL_JOB_SECRET']);
  });

  it('accepts APP_URL in place of NEXT_PUBLIC_APP_URL', () => {
    const env = { ...allPresent, NEXT_PUBLIC_APP_URL: undefined, APP_URL: 'https://x.test' };
    expect(findMissingEnv(env, REQUIRED_ENV)).toEqual([]);
  });

  it('lists NEXT_PUBLIC_APP_URL when APP_URL is empty too', () => {
    const env = { ...allPresent, NEXT_PUBLIC_APP_URL: '', APP_URL: '' };
    expect(findMissingEnv(env, REQUIRED_ENV)).toEqual(['NEXT_PUBLIC_APP_URL']);
  });
});
