import { View } from 'react-native';
import type { LiveGameState } from '@baseball/shared';

interface BaserunnerDisplayProps {
  gameState: LiveGameState;
}

const DIAMOND_SIZE = 100;

/**
 * Renders a baseball diamond with filled bases for occupied runners.
 * Uses a rotated square grid layout to approximate a diamond shape.
 */
export function BaserunnerDisplay({ gameState }: BaserunnerDisplayProps) {
  const { first, second, third } = gameState.runnersOnBase;

  return (
    <View
      className="items-center justify-center"
      style={{ width: DIAMOND_SIZE, height: DIAMOND_SIZE }}
    >
      {/* Diamond layout using absolute positioning */}
      <View className="relative" style={{ width: 80, height: 80 }}>
        {/* Second base — top center */}
        <Base occupied={!!second} style={{ top: 0, left: 30 }} />
        {/* Third base — left center */}
        <Base occupied={!!third} style={{ top: 30, left: 0 }} />
        {/* First base — right center */}
        <Base occupied={!!first} style={{ top: 30, left: 60 }} />
        {/* Home plate — bottom center (indicator only) */}
        <View
          className="absolute w-4 h-4 bg-gray-300 rotate-45"
          style={{ bottom: 0, left: 32 }}
        />
      </View>
    </View>
  );
}

function Base({
  occupied,
  style,
}: {
  occupied: boolean;
  style: object;
}) {
  return (
    <View
      className={`absolute w-5 h-5 rotate-45 ${
        occupied ? 'bg-yellow-400 border-2 border-yellow-500' : 'bg-gray-200 border-2 border-gray-300'
      }`}
      style={style}
    />
  );
}
