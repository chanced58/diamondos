// Run with: deno test --allow-env supabase/functions/_shared/require-internal.test.ts
import { assert, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isInternalRequest, timingSafeEqual } from './require-internal.ts';

const h = (init: Record<string, string>) => new Headers(init);

Deno.test('accepts the secret header', () =>
  assert(isInternalRequest(h({ 'x-internal-secret': 's' }), { internalSecret: 's' })));

Deno.test('accepts the service-role bearer', () =>
  assert(isInternalRequest(h({ authorization: 'Bearer k' }), { serviceRoleKey: 'k' })));

Deno.test('refuses the anon key, a wrong secret, and no headers', () => {
  const env = { internalSecret: 'secret', serviceRoleKey: 'service-key' };
  assertFalse(isInternalRequest(h({ authorization: 'Bearer anon-key' }), env));
  assertFalse(isInternalRequest(h({ 'x-internal-secret': 'wrong' }), env));
  assertFalse(isInternalRequest(h({}), env));
});

Deno.test('refuses any header when the secret is unset', () =>
  assertFalse(isInternalRequest(h({ 'x-internal-secret': 'anything' }), { internalSecret: undefined })));

Deno.test('refuses an empty bearer when the key is unset', () =>
  assertFalse(isInternalRequest(h({ authorization: 'Bearer ' }), {})));

Deno.test('timingSafeEqual compares whole strings', () => {
  assert(timingSafeEqual('abc', 'abc'));
  assertFalse(timingSafeEqual('abc', 'abd'));
  assertFalse(timingSafeEqual('abc', 'abcd'));
  assertFalse(timingSafeEqual('', 'a'));
});
