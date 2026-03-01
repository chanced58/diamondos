import { View, Text } from 'react-native';
import type { LiveGameState } from '@baseball/shared';

interface CountDisplayProps {
  gameState: LiveGameState;
}

export function CountDisplay({ gameState }: CountDisplayProps) {
  return (
    <View className="flex-row justify-center gap-8 py-4 bg-white border-b border-gray-200">
      <CountItem label="B" value={gameState.balls} total={4} color="green" />
      <CountItem label="S" value={gameState.strikes} total={3} color="yellow" />
      <CountItem label="O" value={gameState.outs} total={3} color="red" />
    </View>
  );
}

function CountItem({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: 'green' | 'yellow' | 'red';
}) {
  const colorMap = {
    green: { filled: 'bg-green-500', empty: 'bg-green-100 border border-green-300' },
    yellow: { filled: 'bg-yellow-400', empty: 'bg-yellow-50 border border-yellow-300' },
    red: { filled: 'bg-red-500', empty: 'bg-red-100 border border-red-300' },
  };

  return (
    <View className="items-center">
      <Text className="text-gray-500 text-xs font-medium mb-1">{label}</Text>
      <View className="flex-row gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            className={`w-4 h-4 rounded-full ${
              i < value ? colorMap[color].filled : colorMap[color].empty
            }`}
          />
        ))}
      </View>
    </View>
  );
}
