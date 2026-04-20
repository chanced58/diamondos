import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useGameState } from '../../../../src/features/scoring/use-game-state';
import { useRecordEvent } from '../../../../src/features/scoring/use-record-event';
import { ScoreBoard } from '../../../../src/features/scoring/ScoreBoard';
import { CountDisplay } from '../../../../src/features/scoring/CountDisplay';
import { BaserunnerDisplay } from '../../../../src/features/scoring/BaserunnerDisplay';
import { PitchInput } from '../../../../src/features/scoring/PitchInput';
import { LoadingSpinner } from '@baseball/ui';
import { Q } from '@nozbe/watermelondb';
import { EventType, PitchOutcome, HitType, HitTrajectory, AdvanceReason } from '@baseball/shared';
import type { PitchThrownPayload, HitPayload, OutPayload, DroppedThirdStrikePayload, DroppedThirdStrikeOutcome, BaserunnerMovePayload, PickoffPayload, ScorePayload, EventVoidedPayload, SubstitutionPayload, PitchingChangePayload } from '@baseball/shared';
import { SubstitutionType } from '@baseball/shared';
import { database } from '../../../../src/db';
import type { GameEvent as WdbGameEvent } from '../../../../src/db/models/GameEvent';
import type { Player } from '../../../../src/db/models/Player';
import type { BattedOutType, RosterPlayer } from '../../../../src/features/scoring/PitchInput';
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

  // Roster for substitution + pitching-change pickers.
  const [roster, setRoster] = useState<RosterPlayer[]>([]);
  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    (async () => {
      const players = await database
        .get<Player>('players')
        .query(Q.where('team_id', teamId), Q.where('is_active', true), Q.sortBy('last_name', Q.asc))
        .fetch();
      if (cancelled) return;
      setRoster(
        players.map((p) => ({
          id: p.remoteId,
          name: p.fullName,
          jerseyNumber: p.jerseyNumber,
        })),
      );
    })();
    return () => { cancelled = true; };
  }, [teamId]);

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

  async function handleOut(outType: BattedOutType) {
    if (!gameState) return;
    const trajectory: HitTrajectory | undefined =
      outType === 'groundout' ? HitTrajectory.GROUND_BALL
      : outType === 'flyout' ? HitTrajectory.FLY_BALL
      : outType === 'lineout' ? HitTrajectory.LINE_DRIVE
      : outType === 'popout' ? HitTrajectory.FLY_BALL
      : undefined;
    const payload: OutPayload = {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      outType,
      ...(trajectory ? { trajectory } : {}),
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

  async function advanceAllRunnersOneBase(reason: AdvanceReason) {
    if (!gameState) return;
    // Advance runner on 3rd first (they score), then 2nd, then 1st,
    // in that order so the replay engine sees consistent base state.
    const runners: Array<{ runnerId: string; fromBase: 1 | 2 | 3 }> = [];
    if (gameState.runnersOnBase.third)  runners.push({ runnerId: gameState.runnersOnBase.third,  fromBase: 3 });
    if (gameState.runnersOnBase.second) runners.push({ runnerId: gameState.runnersOnBase.second, fromBase: 2 });
    if (gameState.runnersOnBase.first)  runners.push({ runnerId: gameState.runnersOnBase.first,  fromBase: 1 });
    for (const r of runners) {
      const toBase = (r.fromBase + 1) as 2 | 3 | 4;
      const advancePayload: BaserunnerMovePayload = {
        runnerId: r.runnerId,
        fromBase: r.fromBase,
        toBase,
        reason,
      };
      await recordEvent(EventType.BASERUNNER_ADVANCE, gameState.inning, gameState.isTopOfInning, advancePayload);
      if (toBase === 4) {
        const scorePayload: ScorePayload = { scoringPlayerId: r.runnerId, rbis: 0 };
        await recordEvent(EventType.SCORE, gameState.inning, gameState.isTopOfInning, scorePayload);
      }
    }
  }

  async function handleWildPitch() {
    if (!gameState) return;
    // Record the wild pitch as a thrown ball so pitch count, count state,
    // and the pitcher's wildPitches stat all update (pitching-stats.ts:288).
    const pitchPayload: PitchThrownPayload = {
      pitcherId: currentPitcherId,
      batterId: currentBatterId,
      outcome: PitchOutcome.BALL,
      isWildPitch: true,
    };
    await recordEvent(EventType.PITCH_THROWN, gameState.inning, gameState.isTopOfInning, pitchPayload);
    await advanceAllRunnersOneBase(AdvanceReason.WILD_PITCH);
  }

  async function handlePassedBall() {
    if (!gameState) return;
    // PB is a catcher misplay — pitch is thrown cleanly and catcher fails
    // to handle it. Flag the pitch so downstream consumers can distinguish
    // the underlying pitch from the mishandling that followed.
    const pitchPayload: PitchThrownPayload = {
      pitcherId: currentPitcherId,
      batterId: currentBatterId,
      outcome: PitchOutcome.BALL,
      isPassedBall: true,
    };
    await recordEvent(EventType.PITCH_THROWN, gameState.inning, gameState.isTopOfInning, pitchPayload);
    await advanceAllRunnersOneBase(AdvanceReason.PASSED_BALL);
  }

  async function handleFieldersChoice(runnerId: string, fromBase: 1 | 2 | 3) {
    if (!gameState) return;
    // OBR: forced runner is retired first, then batter reaches 1st without
    // being credited as a hit. deriveGameState and the stats modules
    // handle the pair via BASERUNNER_OUT removing the runner and
    // HIT(fieldersChoice=true) advancing any remaining runners.
    await recordEvent(EventType.BASERUNNER_OUT, gameState.inning, gameState.isTopOfInning, {
      runnerId,
      fromBase,
      pitcherId: currentPitcherId,
    });
    const hitPayload: HitPayload = {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      hitType: HitType.SINGLE,
      fieldersChoice: true,
    };
    await recordEvent(EventType.HIT, gameState.inning, gameState.isTopOfInning, hitPayload);
  }

  async function handlePitchingChange(newPitcherId: string) {
    if (!gameState) return;
    const payload: PitchingChangePayload = {
      newPitcherId,
      outgoingPitcherId: currentPitcherId,
    };
    await recordEvent(EventType.PITCHING_CHANGE, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handlePinchHitter(newBatterId: string) {
    if (!gameState) return;
    const payload: SubstitutionPayload = {
      inPlayerId: newBatterId,
      outPlayerId: currentBatterId,
      substitutionType: SubstitutionType.PINCH_HITTER,
    };
    await recordEvent(EventType.SUBSTITUTION, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleUndo() {
    if (!gameState) return;
    // Find the most recent live event (skip events already voided, and skip
    // the correction events themselves) and emit EVENT_VOIDED targeting it.
    const eventsCollection = database.get<WdbGameEvent>('game_events');
    const all = await eventsCollection
      .query(Q.where('game_remote_id', gameId), Q.sortBy('sequence_number', Q.asc))
      .fetch();

    const voidedIds = new Set<string>();
    for (const e of all) {
      if (e.eventType === EventType.EVENT_VOIDED) {
        const payload = e.payload as { voidedEventId?: string };
        if (payload.voidedEventId) voidedIds.add(payload.voidedEventId);
      }
    }

    for (let i = all.length - 1; i >= 0; i--) {
      const e = all[i];
      if (e.eventType === EventType.EVENT_VOIDED) continue;
      if (e.eventType === EventType.PITCH_REVERTED) continue;
      if (voidedIds.has(e.remoteId)) continue;
      const payload: EventVoidedPayload = {
        voidedEventId: e.remoteId,
        voidedSequenceNumber: e.sequenceNumber,
      };
      await recordEvent(EventType.EVENT_VOIDED, gameState.inning, gameState.isTopOfInning, payload);
      return;
    }
  }

  async function handlePickoffOut(fromBase: 1 | 2 | 3, runnerId: string) {
    if (!gameState) return;
    const payload: PickoffPayload = {
      runnerId,
      base: fromBase,
      pitcherId: currentPitcherId,
      outcome: 'out',
    };
    await recordEvent(EventType.PICKOFF_ATTEMPT, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleBalk() {
    if (!gameState) return;
    await recordEvent(EventType.BALK, gameState.inning, gameState.isTopOfInning, {
      pitcherId: currentPitcherId,
    });
    // Per OBR 6.02(a) all runners advance one base on a balk. The BALK
    // replay handler shifts r1→r2, r2→r3; the runner previously on
    // third scores via a SCORE event (OBR 9.04(b)(5): no RBI on a balk).
    const thirdRunner = gameState.runnersOnBase.third;
    if (thirdRunner) {
      const scorePayload: ScorePayload = { scoringPlayerId: thirdRunner, rbis: 0 };
      await recordEvent(EventType.SCORE, gameState.inning, gameState.isTopOfInning, scorePayload);
    }
  }

  async function handleDoublePlay() {
    if (!gameState) return;
    // DOUBLE_PLAY credits batter PA+AB and bumps outs by two. The second
    // runner-out is not attributed to a specific base in this UI yet —
    // deriveGameState increments outs but leaves the forced runner on
    // base in the replay state. Tracked as P1 #10 follow-up.
    await recordEvent(EventType.DOUBLE_PLAY, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
    });
  }

  async function handleTriplePlay() {
    if (!gameState) return;
    await recordEvent(EventType.TRIPLE_PLAY, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
    });
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

  // Runners currently on base — passed to PitchInput for the FC picker.
  const runnersOnBase: { base: 1 | 2 | 3; runnerId: string }[] = gameState
    ? [
        gameState.runnersOnBase.first ? { base: 1 as const, runnerId: gameState.runnersOnBase.first } : null,
        gameState.runnersOnBase.second ? { base: 2 as const, runnerId: gameState.runnersOnBase.second } : null,
        gameState.runnersOnBase.third ? { base: 3 as const, runnerId: gameState.runnersOnBase.third } : null,
      ].filter((r): r is { base: 1 | 2 | 3; runnerId: string } => r !== null)
    : [];

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
          onRecordPickoffOut={handlePickoffOut}
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
        onRecordFieldersChoice={handleFieldersChoice}
        onRecordWildPitch={handleWildPitch}
        onRecordPassedBall={handlePassedBall}
        onRecordBalk={handleBalk}
        onRecordDoublePlay={handleDoublePlay}
        onRecordTriplePlay={handleTriplePlay}
        onRecordPitchingChange={handlePitchingChange}
        onRecordPinchHitter={handlePinchHitter}
        roster={roster}
        onUndoLastEvent={handleUndo}
        runnersOnBase={runnersOnBase}
        onRecordDroppedThirdStrike={handleDroppedThirdStrike}
        droppedThirdStrikeEligible={droppedThirdStrikeEligible}
      />
    </View>
  );
}
