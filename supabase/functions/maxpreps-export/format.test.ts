import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { formatBattingAverage } from './format.ts';

Deno.test('formatBattingAverage drops the leading zero below 1', () => {
  assertEquals(formatBattingAverage(2, 4), '.500');
  assertEquals(formatBattingAverage(1, 3), '.333');
  assertEquals(formatBattingAverage(0, 5), '.000');
});

Deno.test('formatBattingAverage keeps 1.000 for a perfect average', () => {
  assertEquals(formatBattingAverage(4, 4), '1.000');
});

Deno.test('formatBattingAverage is .000 with no at-bats', () => {
  assertEquals(formatBattingAverage(0, 0), '.000');
});
