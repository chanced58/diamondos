import type { BattingStats, PitchingStats, SeasonBattingRow, SeasonPitchingRow } from '@baseball/shared';

/**
 * Stat rows as the mobile routes send them: rates that can't be computed
 * (NaN, Infinity — no at-bats, no outs) travel as null, since JSON has no NaN.
 */

export function finiteOrNull<Wire>(row: object): Wire {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'number' && !Number.isFinite(value) ? null : value;
  }
  return out as Wire;
}

export function toBattingRow(s: BattingStats): SeasonBattingRow {
  return finiteOrNull<SeasonBattingRow>(s);
}

export function toPitchingRow(s: PitchingStats): SeasonPitchingRow {
  const baByCount: SeasonPitchingRow['baByCount'] = {};
  for (const [count, stat] of Object.entries(s.baByCount)) baByCount[count] = finiteOrNull(stat);
  return { ...finiteOrNull<SeasonPitchingRow>(s), baByCount };
}
