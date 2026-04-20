import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useGameState } from '../../../../src/features/scoring/use-game-state';
import { useRecordEvent } from '../../../../src/features/scoring/use-record-event';
import { ScoreBoard } from '../../../../src/features/scoring/ScoreBoard';
import { CountDisplay } from '../../../../src/features/scoring/CountDisplay';
import { BaserunnerDisplay } from '../../../../src/features/scoring/BaserunnerDisplay';
import { PitchInput } from '../../../../src/features/scoring/PitchInput';
import { LoadingSpinner } from '@baseball/ui';
import { EventType, PitchOutcome, HitType } from '@baseball/shared';
import type { PitchThrownPayload, HitPayload, OutPayload, DroppedThirdStrikePayload, DroppedThirdStrikeOutcome } from '@baseball/shared';
import { useSyncContext } from '../../../../src/providers/SyncProvider';

/**
 * Live game scoring screen — the core feature of the mobile app.
 * Works completely offline. All events written to WatermelonDB first,
 * then synced to Supabase in the background.
 */
export default function ScoringScreen() {
  const { gameId, teamId = '', opponentName = 'Opponent', teamName = 'Home' } =
    useLocalSearchParams<{
      gameId: string;
      teamId: string;
      opponentName: string;
      teamName: string;
    }>();

  const { gameState, loading } = useGameState(gameId, teamId);
  const { recordEvent } = useRecordEvent(gameId);
  const { isSyncing } = useSyncContext();

  // Placeholder pitcher/batter IDs — in production these come from the lineup
  const currentPitcherId = gameState?.currentPitcherId ?? 'unknown-pitcher';
  const currentBatterId = gameState?.currentBatterId ?? 'unknown-batter';

  async function handlePitch(outcome: PitchOutcome) {
    if (!gameState) return;
    const payload: PitchThrownPayload = {
      pitcherId: currentPitcherId,
      batterId: currentBatterId,
      outcome,
    };
    await recordEvent(
      EventType.PITCH_THROWN,
      gameState.inning,
      gameState.isTopOfInning,
      payload,
    );
  }

  async function handleHit(hitType: HitType) {
    if (!gameState) return;
    const payload: HitPayload = {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      hitType,
    };
    await recordEvent(EventType.HIT, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleOut() {
    if (!gameState) return;
    const payload: OutPayload = {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      outType: 'groundout',
    };
    await recordEvent(EventType.OUT, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleWalk() {
    if (!gameState) return;
    await recordEvent(EventType.WALK, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
    });
  }

  async function handleStrikeout() {
    if (!gameState) return;
    const payload: OutPayload = {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      outType: 'strikeout',
    };
    await recordEvent(EventType.STRIKEOUT, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleDroppedThirdStrike(details: {
    outcome: DroppedThirdStrikeOutcome;
    fieldingSequence?: number[];
    errorBy?: number;
    isWildPitch?: boolean;
  }) {
    if (!gameState) return;
    const payload: DroppedThirdStrikePayload = {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      outcome: details.outcome,
      fieldingSequence: details.fieldingSequence,
      errorBy: details.errorBy,
      isWildPitch: details.isWildPitch,
    };
    await recordEvent(EventType.DROPPED_THIRD_STRIKE, gameState.inning, gameState.isTopOfInning, payload);
  }

  // Dropped third strike is eligible when first base is unoccupied or there are 2 outs
  const droppedThirdStrikeEligible = gameState
    ? gameState.outs === 2 || !gameState.runnersOnBase.first
    : false;

  if (loading || !gameState) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <View className="flex-1 bg-white">
      <Stack.Screen options={{ title: `vs ${opponentName}`, headerShown: true }} />

      {/* Top: scoreboard */}
      <ScoreBoard
        gameState={gameState}
        opponentName={opponentName as string}
        teamName={teamName as string}
      />

      {/* Middle: count + baserunners */}
      <CountDisplay gameState={gameState} />
      <View className="flex-row items-center justify-between px-5 py-3 border-b border-gray-100">
        <View>
          <Text className="text-xs text-gray-500">Pitches (this AB)</Text>
          <Text className="text-lg font-bold text-gray-900">
            {gameState.currentPitcherPitchCount}
          </Text>
        </View>
        <BaserunnerDisplay gameState={gameState} />
        {isSyncing && (
          <Text className="text-xs text-blue-500">Syncing...</Text>
        )}
      </View>

      {/* Bottom: pitch / outcome input */}
      <PitchInput
        onRecordPitch={handlePitch}
        onRecordHit={handleHit}
        onRecordOut={handleOut}
        onRecordWalk={handleWalk}
        onRecordStrikeout={handleStrikeout}
        onRecordDroppedThirdStrike={handleDroppedThirdStrike}
        droppedThirdStrikeEligible={droppedThirdStrikeEligible}
      />
    </View>
  );
}
