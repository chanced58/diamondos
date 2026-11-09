import { countUnsettledConflicts } from '../unsettled';

const conflicts = [
  { kind: 'final_score', side: 'home', homeLog: 1, awayLog: 2 },
  { kind: 'team_hits', side: 'away', homeLog: 6, awayLog: 7 },
] as const;

describe('countUnsettledConflicts', () => {
  it('should count conflicts without an override', () => {
    expect(countUnsettledConflicts([...conflicts], [{ key: 'team_hits:away', useAwayValue: true }], null)).toBe(1);
  });

  it('should count none once the reconciliation is resolved', () => {
    expect(countUnsettledConflicts([...conflicts], [], '2026-11-09T00:00:00Z')).toBe(0);
  });

  it('should count none when every conflict has an override', () => {
    const overrides = [
      { key: 'final_score:home', useAwayValue: false },
      { key: 'team_hits:away', useAwayValue: true },
    ];
    expect(countUnsettledConflicts([...conflicts], overrides, null)).toBe(0);
  });
});
