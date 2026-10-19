'use client';
import type { JSX } from 'react';

import { useEffect, useState } from 'react';

/**
 * Hidden `browserTimeZone` field carrying the submitter's IANA zone. Server
 * actions run in UTC, so a typed date + time means nothing to them without it.
 * Filled after mount so the server render and hydration agree.
 */
export function BrowserTimeZoneInput(): JSX.Element {
  const [timeZone, setTimeZone] = useState('');
  useEffect(() => {
    setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? '');
  }, []);
  return <input type="hidden" name="browserTimeZone" value={timeZone} />;
}
