import {
  normalizeHeader,
  autoDetectMapping,
  applyMapping,
  findUnmappedRequired,
} from '../mapping-engine';

describe('normalizeHeader', () => {
  it('lowercases and strips punctuation/whitespace', () => {
    expect(normalizeHeader('Home Runs')).toBe('homeruns');
    expect(normalizeHeader('  HR  ')).toBe('hr');
    expect(normalizeHeader('2B')).toBe('2b');
    expect(normalizeHeader('K%')).toBe('k');
    expect(normalizeHeader('First_Name')).toBe('firstname');
  });
});

describe('autoDetectMapping', () => {
  const aliases = {
    firstName: ['first', 'firstname'],
    lastName: ['last', 'lastname'],
    bat_hr: ['hr', 'homeruns'],
    bat_h: ['h', 'hits'],
  };

  it('maps source columns to internal fields via the alias table', () => {
    const columns = ['First', 'Last', 'HR', 'Hits'];
    expect(autoDetectMapping(columns, aliases)).toEqual({
      First: 'firstName',
      Last: 'lastName',
      HR: 'bat_hr',
      Hits: 'bat_h',
    });
  });

  it('leaves unrecognized columns out of the mapping', () => {
    const columns = ['First', 'WeirdCol'];
    expect(autoDetectMapping(columns, aliases)).toEqual({ First: 'firstName' });
  });

  it('does not double-assign the same internal field to two columns', () => {
    // Both "H" and "Hits" alias to bat_h; only the first wins.
    const columns = ['H', 'Hits'];
    const result = autoDetectMapping(columns, aliases);
    expect(result).toEqual({ H: 'bat_h' });
  });
});

describe('applyMapping', () => {
  it('renames source columns to internal fields', () => {
    const row = { First: 'Ada', Last: 'Lovelace', HR: '3' };
    const map = { First: 'firstName', Last: 'lastName', HR: 'bat_hr' };
    expect(applyMapping(row, map)).toEqual({
      firstName: 'Ada',
      lastName: 'Lovelace',
      bat_hr: '3',
    });
  });

  it('omits source columns not present in the mapping', () => {
    const row = { First: 'Ada', Ignored: 'x' };
    expect(applyMapping(row, { First: 'firstName' })).toEqual({ firstName: 'Ada' });
  });
});

describe('findUnmappedRequired', () => {
  it('returns required internal fields missing from the mapping values', () => {
    const map = { First: 'firstName' };
    expect(findUnmappedRequired(map, ['firstName', 'lastName'])).toEqual(['lastName']);
  });

  it('returns empty when all required fields are mapped', () => {
    const map = { First: 'firstName', Last: 'lastName' };
    expect(findUnmappedRequired(map, ['firstName', 'lastName'])).toEqual([]);
  });
});
