import { describeFinalizeStatus, PERSISTENT_FAILURE_THRESHOLD } from '../finalize-status';

describe('describeFinalizeStatus', () => {
  describe('unconfigured (no EXPO_PUBLIC_API_BASE_URL)', () => {
    const status = describeFinalizeStatus({ configured: false, consecutiveFailures: 0 });

    it('is kind "unconfigured"', () => {
      expect(status.kind).toBe('unconfigured');
    });

    it('pins the End Game alert copy — no promise of automatic completion', () => {
      expect(status.alertBody('Final score 4–2.')).toBe(
        'Final score 4–2. The game will be marked complete on this device, but this build cannot finalize the result — it has no server address configured.',
      );
    });

    it('pins the banner copy', () => {
      expect(status.bannerTitle).toBe('Not finalized yet');
      expect(status.bannerDetail).toBe(
        'This build has no server address configured, so the result cannot finalize.',
      );
    });

    it('stays unconfigured regardless of failure count — config, not retries, is the blocker', () => {
      const withFailures = describeFinalizeStatus({
        configured: false,
        consecutiveFailures: 99,
      });
      expect(withFailures.kind).toBe('unconfigured');
    });
  });

  describe('pending (configured, not persistently failing)', () => {
    const status = describeFinalizeStatus({ configured: true, consecutiveFailures: 0 });

    it('is kind "pending"', () => {
      expect(status.kind).toBe('pending');
    });

    it('pins the End Game alert copy — promises automatic completion', () => {
      expect(status.alertBody('Final score 4–2.')).toBe(
        'Final score 4–2. The result finalizes automatically when the device is back online.',
      );
    });

    it('pins the banner copy', () => {
      expect(status.bannerTitle).toBe('Not finalized yet');
      expect(status.bannerDetail).toBe('The result will finalize once this device syncs.');
    });

    it('stays pending below the persistent-failure threshold', () => {
      const belowThreshold = describeFinalizeStatus({
        configured: true,
        consecutiveFailures: PERSISTENT_FAILURE_THRESHOLD - 1,
      });
      expect(belowThreshold.kind).toBe('pending');
    });
  });

  describe('persistently-failing (configured, failing repeatedly)', () => {
    const status = describeFinalizeStatus({
      configured: true,
      consecutiveFailures: PERSISTENT_FAILURE_THRESHOLD,
    });

    it('is kind "persistently-failing" at exactly the threshold', () => {
      expect(status.kind).toBe('persistently-failing');
    });

    it('is kind "persistently-failing" above the threshold too', () => {
      const above = describeFinalizeStatus({
        configured: true,
        consecutiveFailures: PERSISTENT_FAILURE_THRESHOLD + 20,
      });
      expect(above.kind).toBe('persistently-failing');
    });

    it('pins the End Game alert copy — no longer promises "just needs time"', () => {
      expect(status.alertBody('Final score 4–2.')).toBe(
        `Final score 4–2. The result has failed to finalize ${PERSISTENT_FAILURE_THRESHOLD} times in a row. It will keep retrying automatically, but this likely needs a coach or admin to check the server.`,
      );
    });

    it('pins the banner copy — distinct title and detail from the pending state', () => {
      expect(status.bannerTitle).toBe('Not finalized — needs attention');
      expect(status.bannerDetail).toBe(
        `Finalizing has failed ${PERSISTENT_FAILURE_THRESHOLD} times in a row. This will keep retrying automatically, but may need a coach or admin to check the server.`,
      );
    });

    it('never claims the server will not keep retrying — retries are still automatic', () => {
      expect(status.alertBody('x')).toMatch(/keep retrying automatically/);
      expect(status.bannerDetail).toMatch(/keep retrying automatically/);
    });
  });
});
