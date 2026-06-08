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

  it('every stat declares subject, sort direction, and group', () => {
    for (const s of STAT_CATALOG) {
      expect(['player', 'team']).toContain(s.subject);
      expect(['asc', 'desc']).toContain(s.sortDir);
      expect(['batting', 'pitching', 'team', 'special']).toContain(s.group);
    }
  });

  it('getStatDef throws on unknown key', () => {
    expect(() => getStatDef('nope' as StatKey)).toThrow();
  });

  it('reserves the synthetic team-table column keys (name/pa/ip) — no catalog stat may use them', () => {
    // The team stat page builds sortable columns by prepending synthetic 'name', 'pa',
    // and 'ip' columns to the catalog stat keys. A catalog key colliding with these
    // would produce duplicate React keys and an ambiguous sort target.
    const reserved = new Set(['name', 'pa', 'ip']);
    expect(STAT_CATALOG.filter((s) => reserved.has(s.key))).toEqual([]);
  });
});
