// Run with: deno test supabase/functions/_shared/alert-cutoff.test.ts
import { assert, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ALERT_MAX_EVENT_AGE_MS, shouldSendPitchAlert } from './alert-cutoff.ts';

const NOW_MS = Date.parse('2026-11-14T20:00:00.000Z');
const HOUR_MS = 3600 * 1000;

Deno.test('alerts for a 5h-old pitch, not a 7h-old one, not garbage', () => {
  assert(shouldSendPitchAlert(new Date(NOW_MS - 5 * HOUR_MS).toISOString(), NOW_MS));
  assertFalse(shouldSendPitchAlert(new Date(NOW_MS - 7 * HOUR_MS).toISOString(), NOW_MS));
  assertFalse(shouldSendPitchAlert('not a date', NOW_MS));
  assertFalse(shouldSendPitchAlert('', NOW_MS));
});

Deno.test('the cutoff is six hours', () => {
  assert(ALERT_MAX_EVENT_AGE_MS === 6 * HOUR_MS);
  assert(shouldSendPitchAlert(new Date(NOW_MS - ALERT_MAX_EVENT_AGE_MS).toISOString(), NOW_MS));
  assertFalse(shouldSendPitchAlert(new Date(NOW_MS - ALERT_MAX_EVENT_AGE_MS - 1).toISOString(), NOW_MS));
});
