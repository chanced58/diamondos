import { View, Text } from 'react-native';
import type { GameDetailResponse } from '@baseball/shared';

type Takeaways = NonNullable<GameDetailResponse['takeaways']>;

const SEVERITY_CLASSES: Record<string, { box: string; text: string }> = {
  high: { box: 'bg-red-50 border-red-200', text: 'text-red-900' },
  medium: { box: 'bg-amber-50 border-amber-200', text: 'text-amber-900' },
  low: { box: 'bg-gray-50 border-gray-200', text: 'text-gray-900' },
};

/**
 * Coach-only weakness takeaways for a completed game (the web's
 * GameTakeaways). A loss gets the stronger "What cost us runs" framing.
 */
export function GameTakeawaysCard({ takeaways }: { takeaways: Takeaways }) {
  if (takeaways.unavailable) {
    return (
      <View className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
        <Text className="text-sm text-gray-600">
          Takeaways are temporarily unavailable for this game. Pull down to try again.
        </Text>
      </View>
    );
  }
  if (takeaways.items.length === 0) return null;

  return (
    <View
      className={`rounded-xl border p-4 ${takeaways.lostGame ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}
    >
      <Text accessibilityRole="header" className="text-sm font-semibold text-gray-900 mb-3">
        {takeaways.lostGame ? 'What cost us runs' : 'Takeaways'}
      </Text>
      <View className="gap-2">
        {takeaways.items.map((item) => {
          const severity = SEVERITY_CLASSES[item.severity] ?? SEVERITY_CLASSES.low;
          return (
            <View key={item.code} className={`rounded-lg border px-3 py-2 ${severity.box}`}>
              <View className="flex-row items-start justify-between gap-2">
                <Text className={`flex-1 text-sm font-medium ${severity.text}`}>{item.label}</Text>
                <Text className={`text-xs opacity-70 ${severity.text}`}>{item.metric}</Text>
              </View>
              <Text className={`mt-1 text-xs ${severity.text}`}>{item.description}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
