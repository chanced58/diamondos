/** Read a (possibly dot-pathed) stat field out of a snapshot `stats` object. */
export function getStatValue(stats: unknown, field: string): number {
  if (stats == null || typeof stats !== 'object') return 0;
  const raw = field.split('.').reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, stats);
  return Number(raw ?? 0);
}
