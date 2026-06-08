import { getStatValue } from '../stat-value';

describe('getStatValue', () => {
  it('reads a top-level numeric field', () => {
    expect(getStatValue({ avg: 0.351 }, 'avg')).toBe(0.351);
  });
  it('reads a dot-pathed nested field', () => {
    expect(getStatValue({ a: { b: 5 } }, 'a.b')).toBe(5);
  });
  it('returns 0 for a missing field or null stats', () => {
    expect(getStatValue({ avg: 0.3 }, 'obp')).toBe(0);
    expect(getStatValue(null, 'avg')).toBe(0);
    expect(getStatValue('not-an-object', 'avg')).toBe(0);
  });
});
