// Hermes has no built-in `crypto` global (unlike browsers/Node), but
// device-id.ts, use-record-event.ts, and local-guest.ts all call
// crypto.randomUUID() as if one exists — every WatermelonDB record id and
// the device id itself depend on it. Must be imported before any of those
// modules run, so this is the first import in app/_layout.tsx.
//
// expo-crypto would be the "proper" source for this, but it ships native
// code — installing it requires rebuilding the dev client via EAS, not just
// a Metro reload. These ids are only ever used as local record identifiers,
// never as security tokens, so a pure-JS RFC 4122 v4 generator (no native
// module, works immediately) is the right tradeoff here.
function randomUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

if (typeof global.crypto === 'undefined') {
  // @ts-expect-error - partial polyfill, only randomUUID is needed here
  global.crypto = {};
}
if (typeof global.crypto.randomUUID === 'undefined') {
  // @ts-expect-error - matches the DOM API's return type (a plain string)
  global.crypto.randomUUID = randomUUID;
}
