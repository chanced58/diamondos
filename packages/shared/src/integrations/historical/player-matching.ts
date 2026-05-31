/**
 * Heuristic player matching for historical imports.
 *
 * Scores a source player (from the import) against existing league players so
 * the reconciliation UI can auto-confirm strong matches, suggest likely ones,
 * and leave the rest to be created. An exact external-id link (resolved via
 * match_player_by_external_id) short-circuits this and is treated as certain.
 */

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);

/** Lowercase, strip accents + punctuation, drop a trailing generational suffix. */
export function normalizePersonName(name: string): string {
  const cleaned = name
    // NFKD splits accented letters into base + combining mark; the
    // alphanumeric filter below then drops the marks (é → e).
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
  const tokens = cleaned.split(' ').filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(' ');
}

/** Split a raw name into first/last, handling "Last, First" and "First Last". */
export function parseName(raw: string): { first: string; last: string } {
  const trimmed = raw.trim();
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',');
    return { first: (first ?? '').trim(), last: (last ?? '').trim() };
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { first: '', last: '' };
  if (tokens.length === 1) return { first: '', last: tokens[0] };
  return { first: tokens[0], last: tokens.slice(1).join(' ') };
}

export interface MatchSource {
  firstName?: string | null;
  lastName?: string | null;
  jerseyNumber?: number | null;
  dateOfBirth?: string | null;
}

export interface MatchCandidate {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: number | null;
  dateOfBirth?: string | null;
}

export interface MatchScore {
  score: number;
  reasons: string[];
}

export type MatchClassification = 'auto' | 'suggest' | 'none';

export const MATCH_AUTO_THRESHOLD = 0.9;
export const MATCH_SUGGEST_THRESHOLD = 0.6;

/**
 * Score in [0, 1]. A last-name match is the anchor; first name, jersey, and DOB
 * add confidence. Last-name mismatch with no other strong signal scores 0.
 */
export function scoreMatch(source: MatchSource, candidate: MatchCandidate): MatchScore {
  const reasons: string[] = [];
  let score = 0;

  const srcLast = normalizePersonName(source.lastName ?? '');
  const candLast = normalizePersonName(candidate.lastName);
  const lastMatch = srcLast.length > 0 && srcLast === candLast;
  if (lastMatch) {
    score += 0.4;
    reasons.push('last name');
  }

  const srcFirst = normalizePersonName(source.firstName ?? '');
  const candFirst = normalizePersonName(candidate.firstName);
  if (srcFirst.length > 0 && candFirst.length > 0) {
    if (srcFirst === candFirst) {
      score += 0.3;
      reasons.push('first name');
    } else if (srcFirst[0] === candFirst[0]) {
      score += 0.15;
      reasons.push('first initial');
    }
  }

  if (
    source.jerseyNumber != null &&
    candidate.jerseyNumber != null &&
    source.jerseyNumber === candidate.jerseyNumber
  ) {
    score += 0.2;
    reasons.push('jersey');
  }

  if (
    source.dateOfBirth &&
    candidate.dateOfBirth &&
    source.dateOfBirth === candidate.dateOfBirth
  ) {
    score += 0.3;
    reasons.push('date of birth');
  }

  // Without a last-name anchor, only a jersey+DOB coincidence could accumulate;
  // require the last name to count any score so we don't match strangers.
  if (!lastMatch) {
    return { score: 0, reasons: [] };
  }

  // Round to avoid float drift (e.g. 0.4+0.3+0.2 = 0.8999…) tipping a true
  // 0.9 below the auto-confirm threshold.
  return { score: Math.min(Math.round(score * 1000) / 1000, 1), reasons };
}

export function classifyMatch(score: number): MatchClassification {
  if (score >= MATCH_AUTO_THRESHOLD) return 'auto';
  if (score >= MATCH_SUGGEST_THRESHOLD) return 'suggest';
  return 'none';
}

export interface BestMatchResult {
  candidate: MatchCandidate;
  score: number;
  reasons: string[];
  classification: MatchClassification;
}

/** Highest-scoring candidate that clears the suggest threshold, else null. */
export function bestMatch(
  source: MatchSource,
  candidates: MatchCandidate[],
): BestMatchResult | null {
  let best: BestMatchResult | null = null;
  for (const candidate of candidates) {
    const { score, reasons } = scoreMatch(source, candidate);
    if (best === null || score > best.score) {
      best = { candidate, score, reasons, classification: classifyMatch(score) };
    }
  }
  if (best === null || best.score < MATCH_SUGGEST_THRESHOLD) return null;
  return best;
}
