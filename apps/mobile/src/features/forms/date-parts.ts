/**
 * Converting between the forms' wall-clock fields ("YYYY-MM-DD", "HH:mm") and
 * the device-local `Date` the native picker works with. Local components on
 * both sides, never UTC: the picker shows the device's wall clock.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function localDateFromParts(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function partsFromLocalDate(value: Date): { date: string; time: string } {
  return {
    date: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}`,
  };
}
