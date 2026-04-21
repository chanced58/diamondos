import { FULL_FIELD_SUBSUMES } from '../constants/practice';
import { PracticeFieldSpace } from '../types/practice-drill';
import { FieldSpaceConflict, ScheduledBlock } from '../types/practice';

export interface ConflictInputBlock extends ScheduledBlock {
  title: string;
  fieldSpaces: PracticeFieldSpace[];
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  // Treat [start, end) as half-open. Blocks that merely abut (one ends when the
  // next begins) are NOT a conflict.
  return aStart < bEnd && bStart < aEnd;
}

function tokensFor(spaces: PracticeFieldSpace[]): Set<PracticeFieldSpace> {
  // Expand full_field to also cover infield and outfield so the pairwise
  // comparison below catches those collisions.
  const set = new Set<PracticeFieldSpace>();
  for (const s of spaces) {
    set.add(s);
    const subsumed = FULL_FIELD_SUBSUMES[s];
    if (subsumed) {
      for (const sub of subsumed) set.add(sub);
    }
  }
  return set;
}

/**
 * Returns one FieldSpaceConflict per contested field_space token. Two blocks
 * conflict if their [startsAt, endsAt) intervals overlap and they share (or
 * one subsumes) a field space. Blocks without any field_spaces are skipped.
 */
export function detectFieldSpaceConflicts(
  blocks: ConflictInputBlock[],
): FieldSpaceConflict[] {
  const byToken = new Map<
    PracticeFieldSpace,
    Array<{
      blockId: string;
      title: string;
      startsAt: string;
      endsAt: string;
      startMs: number;
      endMs: number;
    }>
  >();

  for (const block of blocks) {
    if (!block.fieldSpaces?.length) continue;
    const tokens = tokensFor(block.fieldSpaces);
    const startMs = new Date(block.startsAt).getTime();
    const endMs = new Date(block.endsAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    for (const token of tokens) {
      const bucket = byToken.get(token) ?? [];
      bucket.push({
        blockId: block.blockId,
        title: block.title,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        startMs,
        endMs,
      });
      byToken.set(token, bucket);
    }
  }

  const out: FieldSpaceConflict[] = [];

  for (const [token, rows] of byToken) {
    if (rows.length < 2) continue;
    const conflictingIds = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        if (overlaps(rows[i].startMs, rows[i].endMs, rows[j].startMs, rows[j].endMs)) {
          conflictingIds.add(rows[i].blockId);
          conflictingIds.add(rows[j].blockId);
        }
      }
    }
    if (conflictingIds.size === 0) continue;
    out.push({
      fieldSpace: token,
      overlappingBlocks: rows
        .filter((r) => conflictingIds.has(r.blockId))
        .map(({ blockId, title, startsAt, endsAt }) => ({
          blockId,
          title,
          startsAt,
          endsAt,
        })),
    });
  }

  return out;
}
