import { ScrollView, Text } from 'react-native';
import { SegmentedControl } from '@baseball/ui';
import { APPEARANCE_OPTIONS } from '../../../src/theme/appearance-options';
import { useThemePreference } from '../../../src/theme/ThemeProvider';

/** Per-device theme choice; the preference is stored on this phone only. */
export default function AppearanceScreen() {
  const { themePreference, setThemePreference } = useThemePreference();

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <SegmentedControl
        testID="appearance-control"
        options={APPEARANCE_OPTIONS}
        value={themePreference}
        onChange={setThemePreference}
      />
      <Text className="mt-3 text-sm text-gray-500">System follows your phone's light or dark setting.</Text>
    </ScrollView>
  );
}
