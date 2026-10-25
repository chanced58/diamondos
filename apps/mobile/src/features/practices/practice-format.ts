import { formatDate, formatTime, type PracticeSummary } from '@baseball/shared';

/** Today's practices and later, soonest first; earlier ones, latest first. */
export function splitPractices(practices: PracticeSummary[], now: Date = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const upcoming = practices
    .filter((p) => Date.parse(p.scheduledAt) >= startOfToday)
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const past = practices
    .filter((p) => Date.parse(p.scheduledAt) < startOfToday)
    .sort((a, b) => Date.parse(b.scheduledAt) - Date.parse(a.scheduledAt));
  return { upcoming, past };
}

/** "Oct 25, 2026 · 4:00 PM · 90 min" in the device's zone. */
export function practiceWhen(practice: { scheduledAt: string; durationMinutes: number | null }): string {
  const parts = [formatDate(practice.scheduledAt), formatTime(practice.scheduledAt)];
  if (practice.durationMinutes) parts.push(`${practice.durationMinutes} min`);
  return parts.join(' · ');
}

export const RUN_STATUS_LABELS: Record<string, string> = {
  running: 'In progress',
  completed: 'Done',
};
