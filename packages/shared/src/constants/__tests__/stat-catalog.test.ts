import { STAT_CATALOG, getStatDef, type StatKey } from '../stat-catalog';

describe('STAT_CATALOG', () => {
  it('exposes batting, pitching, and team stats with unique keys', () => {
    const keys = STAT_CATALOG.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(expect.arrayContaining(['avg', 'homeRuns', 'era', 'teamEra']));
  });

  it('marks rate stats as qualified and counting stats as not', () => {
    expect(getStatDef('avg').isRate).toBe(true);
    expect(getStatDef('homeRuns').isRate).toBe(false);
  });

  it('every stat declares subject and sort direction', () => {
    for (const s of STAT_CATALOG) {
      expect(['player', 'team']).toContain(s.subject);
      expect(['asc', 'desc']).toContain(s.sortDir);
    }
  });

  it('getStatDef throws on unknown key', () => {
    expect(() => getStatDef('nope' as StatKey)).toThrow();
  });
});
