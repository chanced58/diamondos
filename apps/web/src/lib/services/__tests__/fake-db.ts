import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A chainable Supabase client fake for service tests. Results are keyed
 * `table.op` (op = select | insert | update | upsert | delete); an array is consumed in
 * call order, its last entry repeating. Every call is recorded with its
 * filters and payload so tests can assert scoping.
 */

export type FakeOp = 'select' | 'insert' | 'update' | 'upsert' | 'delete';
export interface FakeCall {
  table: string;
  op: FakeOp;
  filters: Record<string, unknown>;
  payload?: unknown;
}
export type FakeResult = { data?: unknown; error?: unknown; count?: number };

export function fakeDb(results: Record<string, FakeResult | FakeResult[]> = {}) {
  const calls: FakeCall[] = [];
  const consumed: Record<string, number> = {};

  function next(key: string): FakeResult {
    const entry = results[key];
    if (!Array.isArray(entry)) return entry ?? {};
    const index = consumed[key] ?? 0;
    consumed[key] = index + 1;
    return entry[Math.min(index, entry.length - 1)] ?? {};
  }

  const db = {
    from(table: string) {
      const call: FakeCall = { table, op: 'select', filters: {} };
      calls.push(call);
      let settled: Promise<FakeResult> | null = null;
      const resolve = () => {
        settled ??= Promise.resolve({ data: null, error: null, ...next(`${table}.${call.op}`) });
        return settled;
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return builder; },
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return builder; },
        upsert: (payload: unknown) => { call.op = 'upsert'; call.payload = payload; return builder; },
        delete: () => { call.op = 'delete'; return builder; },
        eq: (col: string, val: unknown) => { call.filters[col] = val; return builder; },
        in: (col: string, val: unknown) => { call.filters[col] = val; return builder; },
        // Range filters record as `col>=` / `col<`, so a test can tell them apart.
        gte: (col: string, val: unknown) => { call.filters[`${col}>=`] = val; return builder; },
        lt: (col: string, val: unknown) => { call.filters[`${col}<`] = val; return builder; },
        gt: (col: string, val: unknown) => { call.filters[`${col}>`] = val; return builder; },
        neq: (col: string, val: unknown) => { call.filters[`${col}!=`] = val; return builder; },
        is: (col: string, val: unknown) => { call.filters[`${col} is`] = val; return builder; },
        // A PostgREST `or` expression records as-is under `or`.
        or: (expression: string) => { call.filters.or = expression; return builder; },
        not: () => builder,
        order: () => builder,
        limit: () => builder,
        range: () => builder,
        single: resolve,
        maybeSingle: resolve,
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          resolve().then(onFulfilled, onRejected),
      };
      return builder;
    },
  };
  return { db: db as unknown as SupabaseClient, calls };
}
