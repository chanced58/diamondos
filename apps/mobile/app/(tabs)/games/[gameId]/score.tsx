import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useGameState } from '../../../../src/features/scoring/use-game-state';
import { useRecordEvent } from '../../../../src/features/scoring/use-record-event';
import { ScoreBoard } from '../../../../src/features/scoring/ScoreBoard';
import { CountDisplay } from '../../../../src/features/scoring/CountDisplay';
import { BaserunnerDisplay } from '../../../../src/features/scoring/BaserunnerDisplay';
import { PitchInput } from '../../../../src/features/scoring/PitchInput';
import { LoadingSpinner } from '@baseball/ui';
import { EventType, PitchOutcome, HitType, AdvanceReason } from '@baseball/shared';
import type { PitchThrownPayload, HitPayload, OutPayload, DroppedThirdStrikePayload, DroppedThirdStrikeOutcome, BaserunnerMovePayload, ScorePayload } from '@baseball/shared';
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
  const { isSyncing, lastSyncError, pendingEventsCount } = useSyncContext();

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

  async function handleError() {
    if (!gameState) return;
    await recordEvent(EventType.FIELD_ERROR, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
    });
  }

  async function handleSacrificeFly() {
    if (!gameState) return;
    await recordEvent(EventType.SACRIFICE_FLY, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
    });
  }

  async function handleSacrificeBunt() {
    if (!gameState) return;
    await recordEvent(EventType.SACRIFICE_BUNT, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
    });
  }

  async function handleStolenBase(fromBase: 1 | 2 | 3, runnerId: string) {
    if (!gameState) return;
    const toBase = (fromBase + 1) as 2 | 3 | 4;
    const payload: BaserunnerMovePayload = { runnerId, fromBase, toBase };
    await recordEvent(EventType.STOLEN_BASE, gameState.inning, gameState.isTopOfInning, payload);
    if (toBase === 4) {
      const scorePayload: ScorePayload = { scoringPlayerId: runnerId, rbis: 0 };
      await recordEvent(EventType.SCORE, gameState.inning, gameState.isTopOfInning, scorePayload);
    }
  }

  async function handleCaughtStealing(fromBase: 1 | 2 | 3, runnerId: string) {
    if (!gameState) return;
    const toBase = (fromBase + 1) as 2 | 3 | 4;
    const payload: BaserunnerMovePayload = { runnerId, fromBase, toBase };
    await recordEvent(EventType.CAUGHT_STEALING, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleRunnerAdvance(fromBase: 1 | 2 | 3, runnerId: string, reason: AdvanceReason) {
    if (!gameState) return;
    const toBase = (fromBase + 1) as 2 | 3 | 4;
    const payload: BaserunnerMovePayload = { runnerId, fromBase, toBase, reason };
    await recordEvent(EventType.BASERUNNER_ADVANCE, gameState.inning, gameState.isTopOfInning, payload);
    if (toBase === 4) {
      const scorePayload: ScorePayload = { scoringPlayerId: runnerId, rbis: 0 };
      await recordEvent(EventType.SCORE, gameState.inning, gameState.isTopOfInning, scorePayload);
    }
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
        <BaserunnerDisplay
          gameState={gameState}
          onRecordStolenBase={handleStolenBase}
          onRecordCaughtStealing={handleCaughtStealing}
          onRecordAdvance={handleRunnerAdvance}
        />
        {isSyncing ? (
          <Text className="text-xs text-blue-500">Syncing…</Text>
        ) : lastSyncError ? (
          <Text className="text-xs text-red-600">⚠ Sync failed</Text>
        ) : pendingEventsCount > 0 ? (
          <Text className="text-xs text-amber-600">{pendingEventsCount} unsynced</Text>
        ) : null}
      </View>

      {/* Bottom: pitch / outcome input */}
      <PitchInput
        onRecordPitch={handlePitch}
        onRecordHit={handleHit}
        onRecordOut={handleOut}
        onRecordWalk={handleWalk}
        onRecordStrikeout={handleStrikeout}
        onRecordError={handleError}
        onRecordSacFly={handleSacrificeFly}
        onRecordSacBunt={handleSacrificeBunt}
        onRecordDroppedThirdStrike={handleDroppedThirdStrike}
        droppedThirdStrikeEligible={droppedThirdStrikeEligible}
      />
    </View>
  );
}
