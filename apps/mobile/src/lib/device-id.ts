import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';

const DEVICE_ID_KEY = 'baseball_device_id';

let _deviceId: string | undefined;

/**
 * Returns a stable device UUID. Generated once and persisted in SecureStore.
 * Used as the device_id for game events to support conflict detection during sync.
 */
export async function getDeviceId(): Promise<string> {
  if (_deviceId) return _deviceId;

  const stored = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (stored) {
    _deviceId = stored;
    return stored;
  }

  const newId = randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
  _deviceId = newId;
  return newId;
}
