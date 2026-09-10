/**
 * What should we tell the coach about this game's finalization state?
 *
 * Pulled out of `score.tsx` so the actual strings a coach reads — the End
 * Game confirmation alert and the "Not finalized yet" banner on the Final
 * view — are pinned by unit tests instead of only by a human reading JSX.
 * `score.tsx` calls `describeFinalizeStatus` and renders whatever comes
 * back; it does not decide wording itself.
 *
 * Three states, not two:
 *   - 'unconfigured'         — this build has no server address at all.
 *     Will never finalize until it is rebuilt with one. No "later" promise.
 *   - 'persistently-failing' — configured, but the finalize call has failed
 *     `PERSISTENT_FAILURE_THRESHOLD`+ times in a row for this game. Still
 *     retries automatically, but "just needs time" is no longer an honest
 *     thing to tell a coach — something on the server likely needs a human.
 *   - 'pending'              — configured, no persistent failure recorded
 *     yet (offline, or only a handful of transient failures). The original
 *     "finalizes automatically" promise is still true here.
 */

/**
 * Consecutive finalize failures for a game after which we stop implying
 * "just needs time" and start telling the coach the server likely needs a
 * human. Chosen to ride out a few sync cycles of transient hiccups
 * (5 cycles * ~30s = a couple of minutes) before escalating the language —
 * not tuned further than that; see task-8-review.md finding 1.
 */
export const PERSISTENT_FAILURE_THRESHOLD = 5;

export type FinalizeStatusKind = 'unconfigured' | 'persistently-failing' | 'pending';

export interface FinalizeStatusInput {
  /** Whether this build has EXPO_PUBLIC_API_BASE_URL set at all. */
  configured: boolean;
  /**
   * Consecutive finalize-call failures recorded for this specific game
   * (0 when nothing has failed — either nothing attempted yet, offline, or
   * the last attempt succeeded).
   */
  consecutiveFailures: number;
}

export interface FinalizeStatus {
  kind: FinalizeStatusKind;
  /** Body text for the End Game confirmation alert, given the score line. */
  alertBody: (scoreLine: string) => string;
  /** Title for the persistent "not finalized" banner on the Final view. */
  bannerTitle: string;
  /** Detail line under the banner title. */
  bannerDetail: string;
}

export function describeFinalizeStatus(input: FinalizeStatusInput): FinalizeStatus {
  if (!input.configured) {
    return {
      kind: 'unconfigured',
      alertBody: (scoreLine) =>
        `${scoreLine} The game will be marked complete on this device, but this build cannot finalize the result — it has no server address configured.`,
      bannerTitle: 'Not finalized yet',
      bannerDetail:
        'This build has no server address configured, so the result cannot finalize.',
    };
  }

  if (input.consecutiveFailures >= PERSISTENT_FAILURE_THRESHOLD) {
    return {
      kind: 'persistently-failing',
      alertBody: (scoreLine) =>
        `${scoreLine} The result has failed to finalize on the server ${input.consecutiveFailures} times in a row. It will keep retrying automatically, but this likely needs a coach or admin to check the server.`,
      bannerTitle: 'Not finalized — needs attention',
      bannerDetail: `The server has rejected finalize ${input.consecutiveFailures} times in a row. This will keep retrying automatically, but may need a coach or admin to check the server.`,
    };
  }

  return {
    kind: 'pending',
    alertBody: (scoreLine) =>
      `${scoreLine} The result finalizes automatically when the device is back online.`,
    bannerTitle: 'Not finalized yet',
    bannerDetail: 'The result will finalize once this device syncs.',
  };
}
