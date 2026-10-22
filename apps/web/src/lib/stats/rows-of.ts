/**
 * A query's rows, or a throw naming the failed query: a failed read must not
 * pass for an empty one (no games, no pitch counts) and render wrong stats.
 */
export function rowsOf<T>(result: { data: T | null; error: { message: string } | null }, query: string): T | null {
  if (result.error) throw new Error(`${query} query failed: ${result.error.message}`);
  return result.data;
}
