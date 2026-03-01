import { View, Text } from 'react-native';
import type { LiveGameState } from '@baseball/shared';

interface ScoreBoardProps {
  gameState: LiveGameState;
  opponentName: string;
  teamName: string;
}

export function ScoreBoard({ gameState, opponentName, teamName }: ScoreBoardProps) {
  const inningLabel = gameState.isTopOfInning
    ? `Top ${gameState.inning}`
    : `Bot ${gameState.inning}`;

  return (
    <View className="bg-brand-900 px-5 pt-12 pb-6">
      <Text className="text-blue-300 text-xs text-center uppercase tracking-widest mb-3">
        {inningLabel} • {gameState.outs} Out{gameState.outs !== 1 ? 's' : ''}
      </Text>
      <View className="flex-row justify-center items-center gap-10">
        <View className="items-center">
          <Text className="text-blue-300 text-xs mb-1">{teamName}</Text>
          <Text className="text-white text-5xl font-bold">{gameState.homeScore}</Text>
        </View>
        <Text className="text-blue-400 text-2xl">–</Text>
        <View className="items-center">
          <Text className="text-blue-300 text-xs mb-1">{opponentName}</Text>
          <Text className="text-white text-5xl font-bold">{gameState.awayScore}</Text>
        </View>
      </View>
    </View>
  );
}
