/** Hold through the asynchronous read, event write and optional projection. */
export async function withLineupChangeLock<T>(
  lock: { current: boolean },
  action: () => Promise<T>,
  busyResult: T,
): Promise<T> {
  if (lock.current) return busyResult;
  lock.current = true;
  try {
    return await action();
  } finally {
    lock.current = false;
  }
}
