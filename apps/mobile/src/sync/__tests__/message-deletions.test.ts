import { splitDeletedMessages } from '../message-deletions';

const message = (id: string, deletedAt: string | null = null) => ({ id, body: deletedAt ? '' : 'hi', deleted_at: deletedAt });

describe('splitDeletedMessages', () => {
  it('should write live messages and remove ones pulled already deleted', () => {
    const { live, deletedIds } = splitDeletedMessages([message('a'), message('b', '2026-10-22T01:00:00Z')], [], []);
    expect(live.map((m) => m.id)).toEqual(['a']);
    expect(deletedIds).toEqual(['b']);
  });

  it('should remove older messages deleted since the last pull, even though their rows are not in the pull', () => {
    const { live, deletedIds } = splitDeletedMessages([message('a')], ['old-1'], []);
    expect(live.map((m) => m.id)).toEqual(['a']);
    expect(deletedIds).toEqual(['old-1']);
  });

  it("should never both write and remove a message, and keep a channel cascade's deletions", () => {
    const { live, deletedIds } = splitDeletedMessages([message('a'), message('b')], ['b'], ['c', 'b']);
    expect(live.map((m) => m.id)).toEqual(['a']);
    expect(deletedIds.sort()).toEqual(['b', 'c']);
  });
});
