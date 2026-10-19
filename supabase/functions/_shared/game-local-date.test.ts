// Run with: deno test --allow-none supabase/functions/_shared/game-local-date.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { gameLocalDate } from './game-local-date.ts';

Deno.test('gameLocalDate keeps an Arizona evening game on its local day', () => {
  // 6:30 PM MST on Oct 19 is 01:30 UTC on Oct 20.
  assertEquals(gameLocalDate('2026-10-20T01:30:00+00:00', 'America/Phoenix'), '2026-10-19');
});

Deno.test('gameLocalDate falls back to the UTC day without a usable zone', () => {
  assertEquals(gameLocalDate('2026-10-20T01:30:00+00:00', null), '2026-10-20');
  assertEquals(gameLocalDate('2026-10-20T01:30:00+00:00', 'Mars/Olympus'), '2026-10-20');
});
