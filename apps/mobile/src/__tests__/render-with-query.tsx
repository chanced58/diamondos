import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';

/**
 * Renders a screen inside a fresh React Query client with retries off, so a
 * failing query surfaces on the first try instead of after backoff delays.
 * gcTime Infinity schedules no cache-removal timer: with the 5-minute default,
 * a finished query or mutation keeps Jest running for 5 minutes after the tests.
 */
export function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}
