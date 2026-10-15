import { withLineupChangeLock } from '../lineup-change-lock';

it('blocks another addition while the first is still reading its next slot', async () => {
  const lock = { current: false };
  let release!: () => void;
  const read = new Promise<void>((resolve) => { release = resolve; });
  const writes: number[] = [];
  const first = withLineupChangeLock(lock, async () => { await read; writes.push(10); return 'saved'; }, 'busy');
  expect(await withLineupChangeLock(lock, async () => { writes.push(10); return 'saved'; }, 'busy')).toBe('busy');
  release();
  expect(await first).toBe('saved');
  expect(writes).toEqual([10]);
  expect(lock.current).toBe(false);
});

it('releases the lock after a read or write fails so the scorer can retry', async () => {
  const lock = { current: false };
  await expect(withLineupChangeLock(lock, async () => { throw new Error('read failed'); }, 'busy')).rejects.toThrow('read failed');
  expect(await withLineupChangeLock(lock, async () => 'saved', 'busy')).toBe('saved');
});
