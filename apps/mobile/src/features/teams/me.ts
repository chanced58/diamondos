import { meResponseSchema, type MeResponse } from '@baseball/shared';
import { apiClient, type ApiClient } from '../../lib/api-client';
import { chunkedSecureStore } from '../../lib/secure-storage';

/**
 * The `/api/m/v1/me` bootstrap payload: memberships, tier features and
 * league roles. The last good copy is kept on the device so the app starts
 * offline with the teams and capabilities the user had last time.
 */

const ME_CACHE_KEY = 'diamondos.me';

interface CachedMe {
  userId: string;
  me: MeResponse;
}

export function fetchMe(client: ApiClient = apiClient): Promise<MeResponse> {
  return client.get('/me', meResponseSchema);
}

/** The cached payload for `userId`, or null if none (or it's another user's or unreadable). */
export async function readCachedMe(userId: string): Promise<MeResponse | null> {
  try {
    const raw = await chunkedSecureStore.getItem(ME_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedMe>;
    if (cached.userId !== userId) return null;
    const parsed = meResponseSchema.safeParse(cached.me);
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.warn('me-cache: could not read the cached /me payload', err);
    return null;
  }
}

export async function writeCachedMe(me: MeResponse): Promise<void> {
  try {
    const cached: CachedMe = { userId: me.user.id, me };
    await chunkedSecureStore.setItem(ME_CACHE_KEY, JSON.stringify(cached));
  } catch (err) {
    console.warn('me-cache: could not save the /me payload', err);
  }
}

/** Called on sign-out so the next user on this device never sees it. */
export async function clearCachedMe(): Promise<void> {
  try {
    await chunkedSecureStore.removeItem(ME_CACHE_KEY);
  } catch (err) {
    console.warn('me-cache: could not clear the cached /me payload', err);
  }
}
