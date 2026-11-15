/** Batting average in baseball format: ".500", ".000", "1.000". */
export function formatBattingAverage(hits: number, atBats: number): string {
  if (atBats <= 0) return '.000';
  const fixed = (hits / atBats).toFixed(3);
  return fixed.startsWith('0') ? fixed.slice(1) : fixed;
}
