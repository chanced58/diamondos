export type JobResultInput = {
  lastRunAt: string | null;
  lastOk: boolean | null;
  lastStatus: number | null;
};

/** The "last result" label for a background job's newest collected run. */
export function describeJobResult({ lastRunAt, lastOk, lastStatus }: JobResultInput): string {
  if (lastRunAt === null || lastOk === null) return 'Never run';
  if (lastOk) return `OK ${lastStatus ?? ''}`.trim();
  return lastStatus === null ? 'No response' : `Failed ${lastStatus}`;
}
