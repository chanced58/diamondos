import { describeJobResult } from '../job-result';

describe('describeJobResult', () => {
  it('says Never run when no collected run exists', () => {
    expect(describeJobResult({ lastRunAt: null, lastOk: null, lastStatus: null })).toBe('Never run');
  });

  it('says OK with the status for a successful run', () => {
    expect(describeJobResult({ lastRunAt: '2026-11-14T10:00:00Z', lastOk: true, lastStatus: 200 })).toBe('OK 200');
  });

  it('says Failed with the status for a failed run', () => {
    expect(describeJobResult({ lastRunAt: '2026-11-14T10:00:00Z', lastOk: false, lastStatus: 500 })).toBe('Failed 500');
  });

  it('says No response for a failed run without a status', () => {
    expect(describeJobResult({ lastRunAt: '2026-11-14T10:00:00Z', lastOk: false, lastStatus: null })).toBe('No response');
  });
});
