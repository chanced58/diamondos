/**
 * Pure RFC 5545 VCALENDAR builder for a team's practices and games.
 *
 * Kept dependency-free and side-effect-free so it can be unit-tested directly
 * and reused anywhere we need a calendar feed.
 *
 * Not implemented here (intentional): timezone (VTIMEZONE) blocks. We emit all
 * DTSTART/DTEND in UTC (`…Z` suffix) which every major calendar client
 * understands and which sidesteps the RFC-compliance tarpit of per-team tz
 * declarations. The trade-off: events show in the user's local tz, which is
 * exactly the behavior we want for "my team's schedule."
 */

export interface IcsPractice {
  id: string;
  scheduledAt: string;        // ISO-8601
  durationMinutes: number | null;
  location: string | null;
}

export interface IcsGame {
  id: string;
  scheduledAt: string;        // ISO-8601
  opponentName: string;
  venueName: string | null;
  locationType: 'home' | 'away' | 'neutral';
}

export interface BuildIcsInput {
  teamId: string;
  teamName: string;
  practices: IcsPractice[];
  games: IcsGame[];
  /** ISO timestamp to stamp DTSTAMP with. Defaults to now; parameterized for testing. */
  now?: string;
}

const DEFAULT_PRACTICE_MINUTES = 90;
const DEFAULT_GAME_MINUTES = 150;
const PRODID = '-//DiamondOS//Team Calendar//EN';

/** Escape a text value per RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Format an ISO timestamp as a UTC basic-form date-time: 20260422T153000Z. */
export function formatIcsUtc(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid ISO timestamp: ${iso}`);
  }
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
}

/** Fold a single-line property to <=75 octets per RFC 5545 §3.1. We fold at 73
 *  chars to stay well under the 75-octet limit even with multi-byte characters. */
function foldLine(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    const slice = line.slice(i, i + 73);
    chunks.push(i === 0 ? slice : ` ${slice}`);
    i += 73;
  }
  return chunks.join('\r\n');
}

function buildVevent(
  uid: string,
  dtStamp: string,
  dtStart: string,
  dtEnd: string,
  summary: string,
  location: string | null,
): string[] {
  const out = [
    'BEGIN:VEVENT',
    foldLine(`UID:${uid}`),
    foldLine(`DTSTAMP:${dtStamp}`),
    foldLine(`DTSTART:${dtStart}`),
    foldLine(`DTEND:${dtEnd}`),
    foldLine(`SUMMARY:${escapeIcsText(summary)}`),
  ];
  if (location && location.trim().length > 0) {
    out.push(foldLine(`LOCATION:${escapeIcsText(location)}`));
  }
  out.push('END:VEVENT');
  return out;
}

export function buildIcs(input: BuildIcsInput): string {
  const dtStamp = formatIcsUtc(input.now ?? new Date().toISOString());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    `PRODID:${PRODID}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine(`X-WR-CALNAME:${escapeIcsText(input.teamName)}`),
  ];

  for (const p of input.practices) {
    const dtStart = formatIcsUtc(p.scheduledAt);
    const endIso = addMinutes(p.scheduledAt, p.durationMinutes ?? DEFAULT_PRACTICE_MINUTES);
    lines.push(
      ...buildVevent(
        `practice-${p.id}@diamondos`,
        dtStamp,
        dtStart,
        formatIcsUtc(endIso),
        `${input.teamName} — Practice`,
        p.location,
      ),
    );
  }

  for (const g of input.games) {
    const dtStart = formatIcsUtc(g.scheduledAt);
    const endIso = addMinutes(g.scheduledAt, DEFAULT_GAME_MINUTES);
    const suffix =
      g.locationType === 'home' ? 'vs' : g.locationType === 'away' ? '@' : 'vs';
    lines.push(
      ...buildVevent(
        `game-${g.id}@diamondos`,
        dtStamp,
        dtStart,
        formatIcsUtc(endIso),
        `${input.teamName} ${suffix} ${g.opponentName}`,
        g.venueName,
      ),
    );
  }

  lines.push('END:VCALENDAR');
  // CRLF is required by RFC 5545.
  return lines.join('\r\n') + '\r\n';
}
