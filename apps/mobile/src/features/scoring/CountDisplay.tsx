import { View, Text } from 'react-native';
import type { LiveGameState } from '@baseball/shared';
import { DOT_BALL_FILLED, DOT_STRIKE_FILLED, DOT_OUT_FILLED, DOT_EMPTY } from './scoring-colors';

interface CountDisplayProps {
  gameState: LiveGameState;
}

// Sits directly under ScoreBoard's navy band, reading as one cohesive unit
// with it — colors match web's scoreboard-card count dots exactly.
export function CountDisplay({ gameState }: CountDisplayProps) {
  return (
    <View className="flex-row justify-center gap-8 py-4 bg-white border-b border-gray-200">
      <CountItem label="B" value={gameState.balls} total={4} filled={DOT_BALL_FILLED} />
      <CountItem label="S" value={gameState.strikes} total={3} filled={DOT_STRIKE_FILLED} />
      <CountItem label="O" value={gameState.outs} total={3} filled={DOT_OUT_FILLED} />
    </View>
  );
}

function CountItem({
  label,
  value,
  total,
  filled,
}: {
  label: string;
  value: number;
  total: number;
  filled: string;
}) {
  return (
    <View className="items-center">
      <Text className="text-gray-500 text-xs font-medium mb-1">{label}</Text>
      <View className="flex-row gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            className={`w-4 h-4 rounded-full ${i < value ? filled : DOT_EMPTY}`}
          />
        ))}
      </View>
    </View>
  );
}
