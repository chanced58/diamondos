import { PracticeFieldSpace } from '../../types/practice-drill';
import { ConflictInputBlock, detectFieldSpaceConflicts } from '../practice-conflicts';

function b(
  id: string,
  startsAt: string,
  endsAt: string,
  fieldSpaces: PracticeFieldSpace[],
  title = id,
): ConflictInputBlock {
  return { blockId: id, title, startsAt, endsAt, fieldSpaces };
}

describe('detectFieldSpaceConflicts', () => {
  it('returns no conflicts when intervals touch but do not overlap', () => {
    const conflicts = detectFieldSpaceConflicts([
      b('a', '2026-04-21T18:00:00Z', '2026-04-21T18:30:00Z', [PracticeFieldSpace.CAGE_1]),
      b('b', '2026-04-21T18:30:00Z', '2026-04-21T19:00:00Z', [PracticeFieldSpace.CAGE_1]),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it('flags overlapping blocks sharing a field space', () => {
    const conflicts = detectFieldSpaceConflicts([
      b('a', '2026-04-21T18:00:00Z', '2026-04-21T18:30:00Z', [PracticeFieldSpace.CAGE_1]),
      b('b', '2026-04-21T18:15:00Z', '2026-04-21T18:45:00Z', [PracticeFieldSpace.CAGE_1]),
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fieldSpace).toBe(PracticeFieldSpace.CAGE_1);
    expect(conflicts[0].overlappingBlocks.map((x) => x.blockId).sort()).toEqual(['a', 'b']);
  });

  it('treats full_field as colliding with infield and outfield', () => {
    const conflicts = detectFieldSpaceConflicts([
      b('big', '2026-04-21T18:00:00Z', '2026-04-21T18:30:00Z', [PracticeFieldSpace.FULL_FIELD]),
      b('ifd', '2026-04-21T18:10:00Z', '2026-04-21T18:20:00Z', [PracticeFieldSpace.INFIELD]),
      b('ofd', '2026-04-21T18:25:00Z', '2026-04-21T18:40:00Z', [PracticeFieldSpace.OUTFIELD]),
    ]);
    const tokens = conflicts.map((c) => c.fieldSpace).sort();
    expect(tokens).toContain(PracticeFieldSpace.INFIELD);
    expect(tokens).toContain(PracticeFieldSpace.OUTFIELD);
  });

  it('ignores blocks with no field spaces', () => {
    const conflicts = detectFieldSpaceConflicts([
      b('a', '2026-04-21T18:00:00Z', '2026-04-21T18:30:00Z', []),
      b('b', '2026-04-21T18:00:00Z', '2026-04-21T18:30:00Z', []),
    ]);
    expect(conflicts).toHaveLength(0);
  });

  it('does not flag unrelated field spaces', () => {
    const conflicts = detectFieldSpaceConflicts([
      b('a', '2026-04-21T18:00:00Z', '2026-04-21T18:30:00Z', [PracticeFieldSpace.CAGE_1]),
      b('b', '2026-04-21T18:00:00Z', '2026-04-21T18:30:00Z', [PracticeFieldSpace.BULLPEN_1]),
    ]);
    expect(conflicts).toHaveLength(0);
  });
});
