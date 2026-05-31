/**
 * Generic source-column → internal-field mapping engine.
 *
 * Adapters supply an alias table (internalField → header aliases); this engine
 * proposes a `{ sourceColumn: internalField }` map against the actual headers,
 * applies it to raw rows, and reports required fields the admin still needs to
 * map. The confirmation UI edits the proposed map directly, so the same engine
 * drives both auto-detection and the final commit.
 */
import type { ColumnMapping } from './types';

/** Lowercase + strip everything but a–z and 0–9, for loose header matching. */
export function normalizeHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Propose a `{ sourceColumn: internalField }` mapping by matching each source
 * column's normalized header against the alias table. First column to claim an
 * internal field wins (so a later synonym column doesn't overwrite it).
 */
export function autoDetectMapping(
  columns: string[],
  aliases: Record<string, string[]>,
): ColumnMapping {
  // Build normalized alias → internalField lookup.
  const aliasToField = new Map<string, string>();
  for (const [field, aliasList] of Object.entries(aliases)) {
    for (const alias of aliasList) {
      const key = normalizeHeader(alias);
      if (!aliasToField.has(key)) aliasToField.set(key, field);
    }
  }

  const mapping: ColumnMapping = {};
  const claimed = new Set<string>();
  for (const column of columns) {
    const field = aliasToField.get(normalizeHeader(column));
    if (field && !claimed.has(field)) {
      mapping[column] = field;
      claimed.add(field);
    }
  }
  return mapping;
}

/** Rename a raw row's keys from source columns to internal fields per the map. */
export function applyMapping(
  row: Record<string, string>,
  mapping: ColumnMapping,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [sourceColumn, internalField] of Object.entries(mapping)) {
    if (sourceColumn in row) out[internalField] = row[sourceColumn];
  }
  return out;
}

/** Required internal fields that no source column maps to. */
export function findUnmappedRequired(
  mapping: ColumnMapping,
  requiredFields: string[],
): string[] {
  const mapped = new Set(Object.values(mapping));
  return requiredFields.filter((field) => !mapped.has(field));
}
