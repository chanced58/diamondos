import { useSyncExternalStore } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isAppVersionSupported } from '@baseball/shared';
import { APP_VERSION } from '../../lib/app-version';
import { useRole } from '../../providers/RoleProvider';
import { useThemeColors } from '../../theme/ThemeScope';

const FALLBACK_UPDATE_URL = 'https://testflight.apple.com';

// Dismissal lasts until the next cold start, so it is module state.
let dismissed = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function dismiss() {
  dismissed = true;
  listeners.forEach((listener) => listener());
}

export function resetUpdateBannerDismissalForTests() {
  dismissed = false;
}

async function openUpdateLink(url: string) {
  try {
    await Linking.openURL(url);
  } catch (err) {
    console.warn(`UpdateBanner: could not open ${url}; falling back to TestFlight`, err);
    await Linking.openURL(FALLBACK_UPDATE_URL).catch((fallbackErr) => {
      console.warn('UpdateBanner: could not open TestFlight', fallbackErr);
    });
  }
}

/** Asks the user to update when the server's minimum supported version is above this build. Home only. */
export function UpdateBanner() {
  const { minSupportedAppVersion, appUpdateUrl } = useRole();
  const colors = useThemeColors();
  const isDismissed = useSyncExternalStore(subscribe, () => dismissed);

  if (isDismissed || !appUpdateUrl) return null;
  if (isAppVersionSupported(APP_VERSION, minSupportedAppVersion)) return null;

  return (
    <View className="mx-4 mt-3 flex-row items-center bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <View className="flex-1">
        <Text className="text-amber-900 text-sm">
          This version of DiamondOS is out of date. Update to keep everything working.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void openUpdateLink(appUpdateUrl)}
          className="mt-2 self-start bg-amber-600 rounded-lg px-3 py-1.5"
        >
          <Text className="text-white text-sm font-semibold">Update</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={dismiss} hitSlop={12} className="ml-3">
        <Ionicons name="close" size={20} color={colors['fg-subtle']} />
      </Pressable>
    </View>
  );
}
