// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertBuildEnv, REQUIRED_BUILD_ENV } = require('../../build-env');

const COMPLETE = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  EXPO_PUBLIC_API_BASE_URL: 'https://app.example.com',
};

describe('assertBuildEnv', () => {
  it('requires both Supabase variables and the web API base URL', () => {
    expect(REQUIRED_BUILD_ENV).toEqual([
      'EXPO_PUBLIC_SUPABASE_URL',
      'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      'EXPO_PUBLIC_API_BASE_URL',
    ]);
  });

  it('fails an EAS build that is missing the web API base URL, naming it', () => {
    expect(() =>
      assertBuildEnv({ ...COMPLETE, EAS_BUILD: 'true', EXPO_PUBLIC_API_BASE_URL: undefined }),
    ).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
  });

  it('fails an EAS build that is missing the Supabase URL, naming it', () => {
    expect(() =>
      assertBuildEnv({ ...COMPLETE, EAS_BUILD: 'true', EXPO_PUBLIC_SUPABASE_URL: undefined }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('fails an EAS build that is missing the anon key, naming it', () => {
    expect(() =>
      assertBuildEnv({ ...COMPLETE, EAS_BUILD: 'true', EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('treats blank values as missing', () => {
    expect(() =>
      assertBuildEnv({ EAS_BUILD: 'true', EXPO_PUBLIC_SUPABASE_URL: '  ', EXPO_PUBLIC_SUPABASE_ANON_KEY: '' }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL.*EXPO_PUBLIC_SUPABASE_ANON_KEY/s);
  });

  it('passes an EAS build with every variable set', () => {
    expect(() => assertBuildEnv({ EAS_BUILD: 'true', ...COMPLETE })).not.toThrow();
  });

  it('leaves local runs alone, where .env.local may supply the values later or not at all', () => {
    expect(() => assertBuildEnv({})).not.toThrow();
    expect(() => assertBuildEnv({ EAS_BUILD: 'false' })).not.toThrow();
  });
});
