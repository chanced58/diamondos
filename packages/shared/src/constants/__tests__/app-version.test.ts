import {
  MIN_SUPPORTED_MOBILE_VERSION,
  MOBILE_APP_UPDATE_URL,
  compareAppVersions,
  isAppVersionSupported,
} from '../app-version';

describe('compareAppVersions', () => {
  it('should order versions numerically per part', () => {
    expect(compareAppVersions('1.0.0', '1.1.0')).toBeLessThan(0);
    expect(compareAppVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('should treat missing parts as zero and ignore suffixes', () => {
    expect(compareAppVersions('1.1', '1.1.0')).toBe(0);
    expect(compareAppVersions('1.1.0-beta', '1.1.0')).toBe(0);
    expect(compareAppVersions('1.1.0+42', '1.1.0')).toBe(0);
  });

  it('should never throw on garbage input', () => {
    expect(() => compareAppVersions('garbage', '1.1.0')).not.toThrow();
    expect(() => compareAppVersions('', '')).not.toThrow();
    expect(Number.isNaN(compareAppVersions('x.y', '1..2'))).toBe(false);
  });
});

describe('isAppVersionSupported', () => {
  it('should compare against the minimum', () => {
    expect(isAppVersionSupported('1.0.0', '1.1.0')).toBe(false);
    expect(isAppVersionSupported('1.1.0', '1.1.0')).toBe(true);
  });

  it('should be true when either side is missing or non-numeric', () => {
    expect(isAppVersionSupported(null, '1.1.0')).toBe(true);
    expect(isAppVersionSupported('1.0.0', undefined)).toBe(true);
    expect(isAppVersionSupported('garbage', '1.1.0')).toBe(true);
    expect(isAppVersionSupported('1.0.0', 'garbage')).toBe(true);
  });
});

describe('constants', () => {
  it('should not warn anyone yet and open TestFlight', () => {
    expect(MIN_SUPPORTED_MOBILE_VERSION).toBe('1.0.0');
    expect(MOBILE_APP_UPDATE_URL).toBe('itms-beta://');
  });
});
