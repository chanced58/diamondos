// Run with: deno test --allow-none supabase/functions/maxpreps-export/xml.test.ts
import { assertEquals, assertMatch, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildMaxPrepsXml, escapeXml, type AggregatedGame } from './xml.ts';

function sampleGame(overrides: Partial<AggregatedGame> = {}): AggregatedGame {
  return {
    gameId: '11111111-1111-1111-1111-111111111111',
    gameDate: '2026-05-01T22:00:00.000Z',
    teamName: 'Lakeside Lions',
    opponentName: 'Hillcrest Hornets',
    homeScore: 7,
    awayScore: 4,
    players: [
      {
        playerId: 'pl-1',
        firstName: 'Jane',
        lastName: 'Doe',
        jerseyNumber: 12,
        stats: { ab: 4, r: 2, h: 2, doubles: 1, triples: 0, hr: 1, rbi: 3, bb: 0, so: 1 },
      },
    ],
    ...overrides,
  };
}

Deno.test('escapeXml escapes the five XML metacharacters', () => {
  assertEquals(escapeXml('a & b'), 'a &amp; b');
  assertEquals(escapeXml('1 < 2'), '1 &lt; 2');
  assertEquals(escapeXml('2 > 1'), '2 &gt; 1');
  assertEquals(escapeXml('she said "hi"'), 'she said &quot;hi&quot;');
  assertEquals(escapeXml("it's fine"), 'it&apos;s fine');
});

Deno.test('single-game XML includes declaration, root, and game element', () => {
  const xml = buildMaxPrepsXml([sampleGame()]);
  assertMatch(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assertStringIncludes(xml, '<MaxPrepsExport');
  assertStringIncludes(xml, '<Game gameId="11111111-1111-1111-1111-111111111111"');
  assertStringIncludes(xml, 'date="2026-05-01"');
  assertStringIncludes(xml, 'teamName="Lakeside Lions"');
  assertStringIncludes(xml, '</MaxPrepsExport>');
});

Deno.test('player element contains batting stats with computed AVG', () => {
  const xml = buildMaxPrepsXml([sampleGame()]);
  assertStringIncludes(xml, 'firstName="Jane"');
  assertStringIncludes(xml, 'lastName="Doe"');
  assertStringIncludes(xml, 'jersey="12"');
  assertStringIncludes(xml, 'AB="4"');
  assertStringIncludes(xml, 'H="2"');
  assertStringIncludes(xml, 'HR="1"');
  assertStringIncludes(xml, 'AVG=".500"');
});

Deno.test('AVG defaults to .000 when AB is zero', () => {
  const xml = buildMaxPrepsXml([
    sampleGame({
      players: [
        {
          playerId: 'pl-1',
          firstName: 'A',
          lastName: 'B',
          jerseyNumber: null,
          stats: { ab: 0, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 1, so: 0 },
        },
      ],
    }),
  ]);
  assertStringIncludes(xml, 'AVG=".000"');
});

Deno.test('multi-game batch produces one Game element per entry', () => {
  const xml = buildMaxPrepsXml([
    sampleGame({ gameId: 'g-1', opponentName: 'A' }),
    sampleGame({ gameId: 'g-2', opponentName: 'B' }),
    sampleGame({ gameId: 'g-3', opponentName: 'C' }),
  ]);
  const matches = xml.match(/<Game /g);
  assertEquals(matches?.length, 3);
  assertStringIncludes(xml, 'gameId="g-1"');
  assertStringIncludes(xml, 'gameId="g-2"');
  assertStringIncludes(xml, 'gameId="g-3"');
});

Deno.test('opponent names with XML metacharacters are escaped', () => {
  const xml = buildMaxPrepsXml([sampleGame({ opponentName: 'Hill & Dale <JV>' })]);
  assertStringIncludes(xml, 'opponent="Hill &amp; Dale &lt;JV&gt;"');
});

Deno.test('jersey number null omits the attribute', () => {
  const xml = buildMaxPrepsXml([
    sampleGame({
      players: [
        {
          playerId: 'pl-1',
          firstName: 'A',
          lastName: 'B',
          jerseyNumber: null,
          stats: { ab: 1, r: 0, h: 0, doubles: 0, triples: 0, hr: 0, rbi: 0, bb: 0, so: 1 },
        },
      ],
    }),
  ]);
  // No jersey="…" attribute should appear on the Player element.
  const playerLine = xml.split('\n').find((l) => l.includes('<Player'));
  assertEquals(playerLine?.includes('jersey='), false);
});
