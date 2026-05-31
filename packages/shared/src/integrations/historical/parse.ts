/**
 * CSV + XML parsing for historical imports.
 *
 * Pure and dependency-light enough to run in the browser, in a Deno edge
 * function (import the same npm modules via esm.sh), and in Node tests. Keep
 * this free of Node-only APIs (Buffer, fs) so the Deno path stays valid.
 */
import Papa from 'papaparse';
import { XMLParser } from 'fast-xml-parser';

function toText(input: string | Uint8Array): string {
  if (typeof input === 'string') return input;
  return new TextDecoder('utf-8').decode(input);
}

/** Parse CSV bytes/string into objects keyed by header. Empty lines skipped. */
export function parseCSV(input: string | Uint8Array): Record<string, string>[] {
  const text = toText(input);
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (v) => v.trim(),
  });
  return result.data.filter((row) => Object.keys(row).length > 0);
}

/** Header columns of a CSV, in order, without parsing every row. */
export function csvHeaders(input: string | Uint8Array): string[] {
  const text = toText(input);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const parsed = Papa.parse<string[]>(firstLine, { header: false });
  return (parsed.data[0] ?? []).map((h) => h.trim());
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
});

/** Parse XML bytes/string into a plain object tree. */
export function parseXML(input: string | Uint8Array): unknown {
  return xmlParser.parse(toText(input));
}

/** Detect the file kind from its name (extension) with an XML content fallback. */
export function detectFileKind(name: string, input: string | Uint8Array): 'csv' | 'xml' {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.csv')) return 'csv';
  return toText(input).trimStart().startsWith('<') ? 'xml' : 'csv';
}
