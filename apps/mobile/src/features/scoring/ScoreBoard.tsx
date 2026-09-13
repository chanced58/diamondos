import { View, Text } from 'react-native';
import type { LiveGameState } from '@baseball/shared';

interface ScoreBoardProps {
  gameState: LiveGameState;
  opponentName: string;
  teamName: string;
}

/**
 * One compact bar: score on the left, situation on the right.
 *
 * This used to be a stacked block — a centred inning line above 5xl scores,
 * with pt-12 of safe-area padding — costing ~170pt of height. The screen
 * below it is the scoring surface, and on the narrowest iPad that block was
 * taking close to a quarter of the vertical space available for tap targets.
 * The pt-12 was compensating for a notch that the Stack header (headerShown:
 * true in score.tsx) already covers, so it was pure loss.
 *
 * Names use flexShrink: 1 explicitly. React Native's Yoga defaults flexShrink
 * to 0, unlike web CSS — without it a long team name pushes the situation
 * label off the right edge instead of ellipsizing.
 */
export function ScoreBoard({ gameState, opponentName, teamName }: ScoreBoardProps) {
  const inningLabel = gameState.isTopOfInning
    ? `Top ${gameState.inning}`
    : `Bot ${gameState.inning}`;

  return (
    <View className="bg-brand-900 px-4 py-2 flex-row items-center justify-between">
      <View className="flex-row items-center gap-2.5 flex-1 mr-2">
        <Text
          className="text-blue-300 text-xs"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {teamName}
        </Text>
        <Text className="text-white text-2xl font-bold">{gameState.homeScore}</Text>
        <Text className="text-blue-400 text-base">–</Text>
        <Text className="text-white text-2xl font-bold">{gameState.awayScore}</Text>
        <Text
          className="text-blue-300 text-xs"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {opponentName}
        </Text>
      </View>
      <Text className="text-blue-300 text-xs uppercase tracking-widest">
        {inningLabel} • {gameState.outs} Out{gameState.outs !== 1 ? 's' : ''}
      </Text>
    </View>
  );
}
