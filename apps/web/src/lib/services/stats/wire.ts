import {
  perGameRate,
  type BattingStats,
  type PitchingStats,
  type SeasonBattingRow,
  type SeasonPitchingRow,
} from '@baseball/shared';

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

/**
 * A pitching line on the wire, `s` derived per the league's stat innings.
 * `strikeoutsPerSeven` / `walksPerSeven` stay per 7 innings whatever the
 * league plays, because app builds from before per-league innings label them
 * K/7 and BB/7; `strikeoutsPerGame` / `walksPerGame` carry `s`'s own per-N
 * values for the K/N and BB/N columns of current builds.
 */
export function toPitchingRow(s: PitchingStats): SeasonPitchingRow {
  const baByCount: SeasonPitchingRow['baByCount'] = {};
  for (const [count, stat] of Object.entries(s.baByCount)) baByCount[count] = finiteOrNull(stat);
  const outs = s.inningsPitchedOuts;
  return finiteOrNull<SeasonPitchingRow>({
    ...s,
    strikeoutsPerSeven: outs > 0 ? perGameRate(s.strikeouts, outs) : s.strikeoutsPerSeven,
    walksPerSeven: outs > 0 ? perGameRate(s.walksAllowed, outs) : s.walksPerSeven,
    strikeoutsPerGame: s.strikeoutsPerSeven,
    walksPerGame: s.walksPerSeven,
    baByCount,
  });
}
