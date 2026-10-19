// eslint-disable-next-line @typescript-eslint/no-var-requires
const { assertBuildEnv, REQUIRED_BUILD_ENV } = require('../../build-env');

const COMPLETE = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
};

describe('assertBuildEnv', () => {
  it('requires both Supabase variables', () => {
    expect(REQUIRED_BUILD_ENV).toEqual(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']);
  });

  it('fails an EAS build that is missing the Supabase URL, naming it', () => {
    expect(() =>
      assertBuildEnv({ EAS_BUILD: 'true', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL/);
  });

  it('fails an EAS build that is missing the anon key, naming it', () => {
    expect(() =>
      assertBuildEnv({ EAS_BUILD: 'true', EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  });

  it('treats blank values as missing', () => {
    expect(() =>
      assertBuildEnv({ EAS_BUILD: 'true', EXPO_PUBLIC_SUPABASE_URL: '  ', EXPO_PUBLIC_SUPABASE_ANON_KEY: '' }),
    ).toThrow(/EXPO_PUBLIC_SUPABASE_URL.*EXPO_PUBLIC_SUPABASE_ANON_KEY/s);
  });

  it('passes an EAS build with both variables set', () => {
    expect(() => assertBuildEnv({ EAS_BUILD: 'true', ...COMPLETE })).not.toThrow();
  });

  it('leaves local runs alone, where .env.local may supply the values later or not at all', () => {
    expect(() => assertBuildEnv({})).not.toThrow();
    expect(() => assertBuildEnv({ EAS_BUILD: 'false' })).not.toThrow();
  });
});
