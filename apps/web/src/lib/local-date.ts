/**
 * Local-calendar YYYY-MM-DD without the UTC rollover that toISOString() causes.
 * Use this whenever a `<input type="date">` value should reflect the viewer's
 * local calendar day — e.g. default values or same-day "end now" actions.
 */
export function localDateYmd(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
