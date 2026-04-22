// Run with: deno test --allow-none supabase/functions/_shared/ics.test.ts
import { assertEquals, assertMatch, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildIcs, escapeIcsText, formatIcsUtc, type IcsGame, type IcsPractice } from './ics.ts';

const FIXED_NOW = '2026-04-22T15:30:45.000Z';

const practice = (overrides: Partial<IcsPractice> = {}): IcsPractice => ({
  id: 'pr-1',
  scheduledAt: '2026-05-01T22:00:00.000Z',
  durationMinutes: 90,
  location: 'Main Field',
  ...overrides,
});

const game = (overrides: Partial<IcsGame> = {}): IcsGame => ({
  id: 'g-1',
  scheduledAt: '2026-05-08T23:30:00.000Z',
  opponentName: 'Hillcrest Hornets',
  venueName: 'Lakeside Field',
  locationType: 'home',
  ...overrides,
});

Deno.test('formatIcsUtc emits basic-form UTC date-time', () => {
  assertEquals(formatIcsUtc('2026-05-01T22:00:00.000Z'), '20260501T220000Z');
  assertEquals(formatIcsUtc('2026-12-31T23:59:59.000Z'), '20261231T235959Z');
});

Deno.test('formatIcsUtc throws on invalid ISO string', () => {
  let threw = false;
  try {
    formatIcsUtc('not a date');
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test('escapeIcsText escapes RFC 5545 special characters', () => {
  // RFC 5545 §3.3.11: backslash, semicolon, comma, newline must be escaped.
  assertEquals(escapeIcsText('a, b; c'), 'a\\, b\\; c');
  assertEquals(escapeIcsText('line1\nline2'), 'line1\\nline2');
  assertEquals(escapeIcsText('back\\slash'), 'back\\\\slash');
  // Preserve order: backslash must be first-escaped so subsequent substitutions
  // don't get double-escaped.
  assertEquals(escapeIcsText('a\\,b'), 'a\\\\\\,b');
});

Deno.test('buildIcs emits a valid VCALENDAR shell', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Test Team',
    practices: [],
    games: [],
    now: FIXED_NOW,
  });
  assertMatch(ics, /^BEGIN:VCALENDAR\r\n/);
  assertStringIncludes(ics, 'VERSION:2.0\r\n');
  assertStringIncludes(ics, 'PRODID:-//DiamondOS//Team Calendar//EN\r\n');
  assertStringIncludes(ics, 'X-WR-CALNAME:Test Team\r\n');
  assertMatch(ics, /END:VCALENDAR\r\n$/);
});

Deno.test('buildIcs emits VEVENT with UID, DTSTART, DTEND, SUMMARY, LOCATION', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Test Team',
    practices: [practice()],
    games: [],
    now: FIXED_NOW,
  });
  assertStringIncludes(ics, 'BEGIN:VEVENT\r\n');
  assertStringIncludes(ics, 'UID:practice-pr-1@diamondos\r\n');
  assertStringIncludes(ics, 'DTSTAMP:20260422T153045Z\r\n');
  assertStringIncludes(ics, 'DTSTART:20260501T220000Z\r\n');
  // 22:00Z + 90min = 23:30Z
  assertStringIncludes(ics, 'DTEND:20260501T233000Z\r\n');
  assertStringIncludes(ics, 'SUMMARY:Test Team — Practice\r\n');
  assertStringIncludes(ics, 'LOCATION:Main Field\r\n');
  assertStringIncludes(ics, 'END:VEVENT\r\n');
});

Deno.test('buildIcs omits LOCATION when null or empty', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Test Team',
    practices: [practice({ location: null })],
    games: [],
    now: FIXED_NOW,
  });
  assertEquals(ics.includes('LOCATION:'), false);
});

Deno.test('buildIcs defaults practice duration to 90 minutes when null', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Test Team',
    practices: [practice({ durationMinutes: null })],
    games: [],
    now: FIXED_NOW,
  });
  // 22:00Z + 90 default = 23:30Z
  assertStringIncludes(ics, 'DTEND:20260501T233000Z\r\n');
});

Deno.test('buildIcs escapes commas, semicolons, newlines in SUMMARY/LOCATION', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Test Team',
    practices: [
      practice({ location: 'Main Field; weather backup: Gym B, upstairs\nbring keys' }),
    ],
    games: [],
    now: FIXED_NOW,
  });
  assertStringIncludes(
    ics,
    'LOCATION:Main Field\\; weather backup: Gym B\\, upstairs\\nbring keys\r\n',
  );
});

Deno.test('buildIcs formats home and away game summaries differently', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Lakeside Lions',
    practices: [],
    games: [
      game({ id: 'g-home', locationType: 'home', opponentName: 'Hornets' }),
      game({ id: 'g-away', locationType: 'away', opponentName: 'Titans' }),
    ],
    now: FIXED_NOW,
  });
  assertStringIncludes(ics, 'SUMMARY:Lakeside Lions vs Hornets\r\n');
  assertStringIncludes(ics, 'SUMMARY:Lakeside Lions @ Titans\r\n');
});

Deno.test('buildIcs uses deterministic UIDs from row IDs', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Test Team',
    practices: [practice({ id: 'abc' })],
    games: [game({ id: 'xyz' })],
    now: FIXED_NOW,
  });
  assertStringIncludes(ics, 'UID:practice-abc@diamondos\r\n');
  assertStringIncludes(ics, 'UID:game-xyz@diamondos\r\n');
});

Deno.test('buildIcs lines end in CRLF per RFC 5545', () => {
  const ics = buildIcs({
    teamId: 'team-1',
    teamName: 'Test Team',
    practices: [practice()],
    games: [],
    now: FIXED_NOW,
  });
  // The string must only use CRLF line endings. A lone \n (without a preceding
  // \r) would be non-compliant.
  const lines = ics.split('\r\n');
  // Rejoined should equal the original exactly if every separator was CRLF.
  assertEquals(lines.join('\r\n'), ics);
  assertEquals(ics.includes('\n') && !ics.includes('\r\n'), false);
});
