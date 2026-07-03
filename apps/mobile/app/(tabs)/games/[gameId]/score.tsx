import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useGameState } from '../../../../src/features/scoring/use-game-state';
import { useRecordEvent } from '../../../../src/features/scoring/use-record-event';
import { ScoreBoard } from '../../../../src/features/scoring/ScoreBoard';
import { CountDisplay } from '../../../../src/features/scoring/CountDisplay';
import { BaserunnerDisplay } from '../../../../src/features/scoring/BaserunnerDisplay';
import { PitchInput } from '../../../../src/features/scoring/PitchInput';
import { GuestPlayerModal } from '../../../../src/features/scoring/GuestPlayerModal';
import { useDefensiveLineup } from '../../../../src/features/scoring/use-defensive-lineup';
import { LoadingSpinner } from '@baseball/ui';
import { Q } from '@nozbe/watermelondb';
import { EventType, PitchOutcome, HitType, HitTrajectory, AdvanceReason, type PitchType, weAreHome, getMaxBattingOrder, isMidGameExtensionAllowed, isDroppedThirdStrikeAllowed, evaluateGameEnd, shouldEndHalfForRunCap, ghostRunnerBaseForHalf, applyLineupSubstitutions, deriveDueBatter, attributePlayersForHalf, OUTS_PER_INNING } from '@baseball/shared';
import type { PitchThrownPayload, HitPayload, OutPayload, DroppedThirdStrikePayload, DroppedThirdStrikeOutcome, BaserunnerMovePayload, PickoffPayload, ScorePayload, EventVoidedPayload, SubstitutionPayload, PitchingChangePayload, BattingSlot, HalfAttribution } from '@baseball/shared';
import { SubstitutionType } from '@baseball/shared';
import { useLeagueContext } from '../../../../src/lib/league-settings';
import { database } from '../../../../src/db';
import type { GameEvent as WdbGameEvent } from '../../../../src/db/models/GameEvent';
import type { Game } from '../../../../src/db/models/Game';
import type { Player } from '../../../../src/db/models/Player';
import type { BattedOutType, RosterPlayer, RunnerOutcome } from '../../../../src/features/scoring/PitchInput';
import { useSyncContext } from '../../../../src/providers/SyncProvider';
import { addLineupRow } from '../../../../src/features/lineup/local-guest';
import { useGameLineups } from '../../../../src/features/lineup/use-game-lineups';

/**
 * Live game scoring screen — the core feature of the mobile app.
 * Works completely offline. All events written to WatermelonDB first,
 * then synced to Supabase in the background.
 */
export default function ScoringScreen() {
  const { gameId, teamId: teamIdParam = '', opponentName = 'Opponent', teamName = 'Home' } =
    useLocalSearchParams<{
      gameId: string;
      teamId: string;
      opponentName: string;
      teamName: string;
    }>();

  const router = useRouter();

  // Resolve the Game row from the local DB — the games list only passes the
  // game id, so team identity (roster, league settings) and home/away must
  // come from the synced games mirror, not route params.
  const [game, setGame] = useState<Game | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const matches = await database
          .get<Game>('games')
          .query(Q.where('remote_id', gameId))
          .fetch();
        if (!cancelled) setGame(matches[0] ?? null);
      } catch (err) {
        console.warn(`Score game lookup failed game=${gameId}:`, err);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);
  const teamId = game?.teamId ?? (teamIdParam as string);
  const isHome = game ? weAreHome(game.locationType, game.neutralHomeTeam ?? null) : true;

  const { gameState, lineScore, events, loading } = useGameState(gameId, teamId);
  const { recordEvent } = useRecordEvent(gameId);
  const { isSyncing, lastSyncError, pendingEventsCount, triggerSync } = useSyncContext();
  const { settings: leagueSettings, leagueId } = useLeagueContext(teamId);
  const maxBatters = getMaxBattingOrder(leagueSettings);
  const midGameExtensionAllowed = isMidGameExtensionAllowed(leagueSettings);

  // League-rule advisories — mercy / run cap / regulation complete. These
  // surface banners; the coach still confirms via the existing End Game /
  // Inning Change controls.
  const gameEndDecision = gameState && lineScore
    ? evaluateGameEnd(
        leagueSettings,
        lineScore,
        gameState.inning,
        gameState.isTopOfInning,
        gameState.outs,
      )
    : null;
  const runCapReached = gameState && lineScore
    ? shouldEndHalfForRunCap(
        leagueSettings,
        lineScore,
        gameState.inning,
        gameState.isTopOfInning,
      )
    : false;
  const ghostRunnerBase = gameState
    ? ghostRunnerBaseForHalf(
        leagueSettings,
        gameState.inning,
        gameState.outs,
        gameState.runnersOnBase,
      )
    : null;

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
          firstName: p.firstName,
          lastName: p.lastName,
          primaryPosition: p.primaryPosition ?? null,
        })),
      );
    })();
    return () => { cancelled = true; };
  }, [teamId]);

  // currentPitcherId is derived from GAME_START / PITCHING_CHANGE /
  // PITCH_THROWN events. When unset, emitted events carry undefined for
  // those fields (the payload types are optional) and stats modules skip
  // the event rather than attribute to a fake player. Scorer establishes
  // the starting values via the "Set Lineup" modal below.
  const currentPitcherId = gameState?.currentPitcherId ?? undefined;
  const defensiveLineup = useDefensiveLineup(gameId, roster);
  const [showLineupModal, setShowLineupModal] = useState(false);

  // The current batting order, observed reactively from the local WatermelonDB
  // game_lineups mirror (synced both ways with Supabase). Drives the due-batter
  // rotation, and the Add Batter flow uses it to know (a) which players are
  // already in the order and (b) the current max batting_order so the new
  // batter lands at end+1.
  const { rows: observedLineupRows, loaded: lineupLoaded } = useGameLineups(gameId);
  const lineupRows = useMemo(
    () =>
      observedLineupRows.map((row) => ({
        player_id: row.playerRemoteId,
        batting_order: row.battingOrder ?? null,
      })),
    [observedLineupRows],
  );

  // ─── Due batter ──────────────────────────────────────────────────────────
  // Our batting order with in-game SUBSTITUTION events (pinch hitters,
  // lineup extensions) folded in, cycled by our team's completed PAs — the
  // same index-based derivation the web ScoringBoard uses.
  const battingSlots = useMemo<BattingSlot[]>(
    () =>
      applyLineupSubstitutions(
        observedLineupRows
          .filter((row) => row.battingOrder != null)
          .map((row) => ({ playerId: row.playerRemoteId, battingOrder: row.battingOrder! })),
        events,
      ),
    [observedLineupRows, events],
  );
  const ourTeamPAs = gameState
    ? (isHome ? gameState.completedBottomHalfPAs : gameState.completedTopHalfPAs)
    : 0;
  const dueBatter = deriveDueBatter(battingSlots, ourTeamPAs);

  // Per-PA manual override — the scorer can point the rotation at a
  // different batter (lineup drifted, skipped batter). Cleared when the PA
  // completes; a mid-PA inning change (3rd out on the bases) keeps both the
  // PA count and the override, matching the batter carrying over.
  const [batterOverrideId, setBatterOverrideId] = useState<string | null>(null);
  useEffect(() => {
    setBatterOverrideId(null);
  }, [ourTeamPAs]);

  const weBat = gameState ? (isHome ? !gameState.isTopOfInning : gameState.isTopOfInning) : false;
  // Effective batter for our offensive half: manual override → lineup-derived
  // due batter → engine state (GAME_START leadoff when no lineup is set).
  const ourBatterId = batterOverrideId ?? dueBatter?.playerId ?? gameState?.currentBatterId ?? null;

  // Every platform player id we can safely attribute events to: our roster
  // plus everyone in the lineup (guests included). Ids outside this set are
  // opponent players (or stale leaks) and must go in opponent* fields.
  const ourPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of roster) ids.add(p.id);
    for (const row of observedLineupRows) ids.add(row.playerRemoteId);
    return ids;
  }, [roster, observedLineupRows]);

  // Half-aware batter/pitcher payload attribution. Replaces the old fixed
  // batterId/pitcherId spread, which mis-filed opponent ids under batterId
  // during the opponent's offensive half.
  const halfAttribution: HalfAttribution = gameState
    ? attributePlayersForHalf({
        weAreHome: isHome,
        isTopOfInning: gameState.isTopOfInning,
        ourBatterId,
        statePitcherId: gameState.currentPitcherId,
        stateBatterId: gameState.currentBatterId,
        ourPlayerIds,
      })
    : {};
  // Pitcher-only subset for baserunning payloads (pickoffs, runner outs).
  const pitcherAttribution = {
    ...(halfAttribution.pitcherId ? { pitcherId: halfAttribution.pitcherId } : {}),
    ...(halfAttribution.opponentPitcherId
      ? { opponentPitcherId: halfAttribution.opponentPitcherId }
      : {}),
  };

  // Display names for the "Now batting" strip + batter picker: roster names
  // win; ad-hoc guests fall back to their lineup display name.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of observedLineupRows) {
      if (row.guestDisplayName) m.set(row.playerRemoteId, row.guestDisplayName);
    }
    for (const p of roster) m.set(p.id, p.name);
    return m;
  }, [roster, observedLineupRows]);
  const [showBatterPicker, setShowBatterPicker] = useState(false);

  // League-pool guests (and any other lineup player outside the roster whose
  // row carries no display name) still have a local players row — resolve
  // their names so the batter strip/picker never shows "Unknown".
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = battingSlots
      .map((s) => s.playerId)
      .filter((id) => !nameById.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const players = await database
        .get<Player>('players')
        .query(Q.where('remote_id', Q.oneOf(missing)))
        .fetch();
      if (cancelled) return;
      setExtraNames((prev) => ({
        ...prev,
        ...Object.fromEntries(players.map((p) => [p.remoteId, p.fullName])),
      }));
    })();
    return () => { cancelled = true; };
  }, [battingSlots, nameById]);
  const batterName = (id: string) => nameById.get(id) ?? extraNames[id] ?? 'Unknown batter';

  const gameStarted = useMemo(
    () => events.some((e) => e.eventType === EventType.GAME_START),
    [events],
  );

  // Dropped-third-strike modal — opened either by the manual button in
  // PitchInput, or automatically by handlePitch when a 3rd-strike pitch is
  // recorded with D3K eligibility (first base empty or two outs).
  const [showD3KModal, setShowD3KModal] = useState(false);
  // Guest-player modal — open via the small button on the score screen,
  // gated on the league's guests.allowed flag.
  const [showGuestModal, setShowGuestModal] = useState(false);

  async function handlePitch(outcome: PitchOutcome, pitchType?: PitchType) {
    if (!gameState) return;
    const payload: PitchThrownPayload = {
      ...halfAttribution,
      outcome,
      ...(pitchType ? { pitchType } : {}),
    };
    await recordEvent(
      EventType.PITCH_THROWN,
      gameState.inning,
      gameState.isTopOfInning,
      payload,
    );

    // HBP is a two-event pair (mirrors the web ScoringBoard): the pitch
    // records the delivery; the HIT_BY_PITCH event places the batter on
    // first and force-advances runners in deriveGameState + stats.
    if (outcome === PitchOutcome.HIT_BY_PITCH) {
      await recordEvent(EventType.HIT_BY_PITCH, gameState.inning, gameState.isTopOfInning, {
        ...halfAttribution,
      });
      return;
    }

    // Auto-complete walks and strikeouts from pitch progression so the scorer
    // doesn't need to tap a separate button. gameState here is the pre-pitch
    // value; +1 reflects the increment this pitch will produce.
    if (outcome === PitchOutcome.BALL && gameState.balls + 1 >= 4) {
      await handleWalk();
      return;
    }
    const isStrikePitch =
      outcome === PitchOutcome.SWINGING_STRIKE ||
      outcome === PitchOutcome.CALLED_STRIKE ||
      outcome === PitchOutcome.FOUL_TIP;
    if (isStrikePitch && gameState.strikes + 1 >= 3) {
      // Per OBR 5.05(a)(2): D3K only applies when first base is unoccupied
      // or there are two outs. Otherwise the batter is out regardless. Some
      // youth leagues disable the rule entirely (settings.rules.droppedThirdStrike).
      const eligible =
        isDroppedThirdStrikeAllowed(leagueSettings) &&
        (gameState.outs === 2 || !gameState.runnersOnBase.first);
      if (eligible) {
        setShowD3KModal(true);
      } else {
        await handleStrikeout();
      }
    }
  }

  async function handleHit(hitType: HitType) {
    if (!gameState) return;
    const payload: HitPayload = {
      ...halfAttribution,
      hitType,
    };
    await recordEvent(EventType.HIT, gameState.inning, gameState.isTopOfInning, payload);
  }

  // Records the HIT plus any linked BASERUNNER_OUT / BASERUNNER_ADVANCE
  // events (via relatedEventId) so the engine + stats correctly suppress
  // default scoring for held or thrown-out runners and so the play feed
  // shows e.g. "Double (Runner thrown out at 3B)".
  async function handleHitWithRunnerOutcomes(hitType: HitType, outcomes: RunnerOutcome[]) {
    if (!gameState) return;
    const payload: HitPayload = {
      ...halfAttribution,
      hitType,
    };
    const hitId = await recordEvent(
      EventType.HIT,
      gameState.inning,
      gameState.isTopOfInning,
      payload,
    );
    for (const outcome of outcomes) {
      if (outcome.kind === 'auto') continue;
      if (outcome.kind === 'thrown_out') {
        await recordEvent(EventType.BASERUNNER_OUT, gameState.inning, gameState.isTopOfInning, {
          runnerId: outcome.runnerId,
          fromBase: outcome.fromBase,
          ...pitcherAttribution,
          relatedEventId: hitId,
          reason: AdvanceReason.ON_PLAY,
        });
      } else {
        // 'held' — runner stops short of the default advance.
        await recordEvent(EventType.BASERUNNER_ADVANCE, gameState.inning, gameState.isTopOfInning, {
          runnerId: outcome.runnerId,
          fromBase: outcome.fromBase,
          toBase: outcome.toBase,
          reason: AdvanceReason.ON_PLAY,
          relatedEventId: hitId,
        });
      }
    }
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
      ...halfAttribution,
      outType,
      ...(trajectory ? { trajectory } : {}),
    };
    await recordEvent(EventType.OUT, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleWalk() {
    if (!gameState) return;
    await recordEvent(EventType.WALK, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
    });
  }

  async function handleStrikeout() {
    if (!gameState) return;
    const payload: OutPayload = {
      ...halfAttribution,
      outType: 'strikeout',
    };
    await recordEvent(EventType.STRIKEOUT, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleError(errorBy: number) {
    if (!gameState) return;
    await recordEvent(EventType.FIELD_ERROR, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
      errorBy,
    });
  }

  async function handleCatcherInterference() {
    if (!gameState) return;
    await recordEvent(EventType.CATCHER_INTERFERENCE, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
    });
  }

  async function handleSacrificeFly() {
    if (!gameState) return;
    await recordEvent(EventType.SACRIFICE_FLY, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
    });
  }

  async function handleSacrificeBunt() {
    if (!gameState) return;
    await recordEvent(EventType.SACRIFICE_BUNT, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
    });
  }

  // Sacrifice path that came from the Out modal — the scorer first picked
  // a trajectory, then upgraded it to a sacrifice. We carry the trajectory
  // on the payload so the play preserves the context the scorer already
  // identified (e.g. flyout → sac fly retains FLY_BALL).
  function trajectoryForOutType(outType: BattedOutType): HitTrajectory | undefined {
    return outType === 'groundout' ? HitTrajectory.GROUND_BALL
      : outType === 'flyout' ? HitTrajectory.FLY_BALL
      : outType === 'lineout' ? HitTrajectory.LINE_DRIVE
      : outType === 'popout' ? HitTrajectory.FLY_BALL
      : undefined;
  }

  async function handleSacrificeFlyFromOut(outType: BattedOutType) {
    if (!gameState) return;
    const trajectory = trajectoryForOutType(outType);
    await recordEvent(EventType.SACRIFICE_FLY, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
      ...(trajectory ? { trajectory } : {}),
    });
  }

  async function handleSacrificeBuntFromOut(outType: BattedOutType) {
    if (!gameState) return;
    const trajectory = trajectoryForOutType(outType);
    await recordEvent(EventType.SACRIFICE_BUNT, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
      ...(trajectory ? { trajectory } : {}),
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
      ...halfAttribution,
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
      ...halfAttribution,
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
      ...pitcherAttribution,
    });
    const hitPayload: HitPayload = {
      ...halfAttribution,
      hitType: HitType.SINGLE,
      fieldersChoice: true,
    };
    await recordEvent(EventType.HIT, gameState.inning, gameState.isTopOfInning, hitPayload);
  }

  // Runner thrown out advancing during a play (e.g., on a hit, sac fly,
  // wild pitch). Standalone BASERUNNER_OUT — the play itself is recorded
  // separately. game-state.ts removes the runner from the base and
  // increments outs; stats modules count it as an out without crediting CS.
  async function handleRunnerOut(runnerId: string, fromBase: 1 | 2 | 3) {
    if (!gameState) return;
    await recordEvent(EventType.BASERUNNER_OUT, gameState.inning, gameState.isTopOfInning, {
      runnerId,
      fromBase,
      ...pitcherAttribution,
    });
  }

  async function handleStartGame(pitcherId: string, batterId: string) {
    if (!gameState) return;
    // Which team are we scoring? `isHome` comes from the resolved Game row's
    // locationType / neutralHomeTeam so road games seed the away* lineup
    // slots instead of misattributing to home*.
    const payload = isHome
      ? { homeLineupPitcherId: pitcherId, homeLeadoffBatterId: batterId }
      : { awayLineupPitcherId: pitcherId, awayLeadoffBatterId: batterId };
    await recordEvent(EventType.GAME_START, gameState.inning, gameState.isTopOfInning, payload);
    setShowLineupModal(false);
  }

  // ─── Inning advancement ─────────────────────────────────────────────────
  // deriveGameState never auto-flips the half at 3 outs — the scorer
  // confirms via the 3-outs prompt (or the End Inning control for early
  // switches like a run cap or time limit). Empty payload matches web.
  const nextHalfLabel = gameState
    ? gameState.isTopOfInning
      ? `Bottom ${gameState.inning}`
      : `Top ${gameState.inning + 1}`
    : '';

  async function handleInningChange() {
    if (!gameState) return;
    await recordEvent(EventType.INNING_CHANGE, gameState.inning, gameState.isTopOfInning, {});
  }

  function confirmInningChange() {
    if (!gameState) return;
    Alert.alert(
      'End half-inning?',
      `Switch sides and start the ${nextHalfLabel} with ${gameState.outs} out${gameState.outs === 1 ? '' : 's'} recorded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch sides', onPress: () => { handleInningChange().catch(console.warn); } },
      ],
    );
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
      // Replace the effective batter (due-batter derivation / override), so
      // applyLineupSubstitutions folds the sub into the right lineup slot.
      outPlayerId: ourBatterId ?? undefined,
      substitutionType: SubstitutionType.PINCH_HITTER,
    };
    await recordEvent(EventType.SUBSTITUTION, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleDefensiveSub(outPlayerId: string, inPlayerId: string, newPosition?: string) {
    if (!gameState) return;
    const payload: SubstitutionPayload = {
      inPlayerId,
      outPlayerId,
      substitutionType: SubstitutionType.DEFENSIVE,
      ...(newPosition ? { newPosition } : {}),
    };
    await recordEvent(EventType.SUBSTITUTION, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handlePositionChange(playerId: string, newPosition: string) {
    if (!gameState) return;
    // Position change keeps the same player on the field; we model it as a
    // SUBSTITUTION with substitutionType=position_change. inPlayerId is the
    // same player (no roster change), so we mirror the convention used by the
    // web ScoringBoard: inPlayerId === outPlayerId === the moving player.
    const payload: SubstitutionPayload = {
      inPlayerId: playerId,
      outPlayerId: playerId,
      substitutionType: SubstitutionType.POSITION_CHANGE,
      newPosition,
    };
    await recordEvent(EventType.SUBSTITUTION, gameState.inning, gameState.isTopOfInning, payload);
  }

  /**
   * Add a batter to the END of the order mid-game. Late arrival, courtesy
   * player, or "everyone bats" lineup extension. The new slot lands at
   * (current max batting_order) + 1; we emit a SUBSTITUTION event for live
   * replay AND create a local game_lineups row so MaxPreps export, season
   * stats, and post-game queries pick the new batter up once it syncs.
   */
  async function handleAddBatter(newBatterId: string) {
    if (!gameState) return;
    // Don't add anyone until the lineup observation has fired — computing
    // currentMax=0 against an unloaded lineup would collide with the real
    // slot-1 occupant.
    if (!lineupLoaded) return;

    // Build the set of player ids already in the BATTING ORDER (bench rows
    // with a null order — e.g. a non-batting pitcher under DH rules — stay
    // addable), including pending in-game LINEUP_EXTENSION events that
    // haven't been reflected in the local rows yet (defense-in-depth against
    // picker filter bypass / two rapid taps).
    const activePlayerIds = new Set(
      lineupRows.filter((row) => row.batting_order != null).map((row) => row.player_id),
    );

    // Compute current max from both the DB snapshot AND any in-game
    // SUBSTITUTION events that already extended the lineup but haven't yet
    // been reflected in lineupRows.
    let currentMax = lineupRows.reduce(
      (max, l) => (l.batting_order ?? 0) > max ? (l.batting_order ?? 0) : max,
      0,
    );
    const eventsCollection = database.get<WdbGameEvent>('game_events');
    const recent = await eventsCollection
      .query(Q.where('game_remote_id', gameId), Q.sortBy('sequence_number', Q.asc))
      .fetch();
    for (const evt of recent) {
      if (evt.eventType !== EventType.SUBSTITUTION) continue;
      const p = evt.payload as Partial<SubstitutionPayload> | undefined;
      if (!p) continue;
      if (p.substitutionType === SubstitutionType.LINEUP_EXTENSION && p.inPlayerId) {
        activePlayerIds.add(p.inPlayerId);
      }
      if (!p.outPlayerId && typeof p.battingOrderPosition === 'number') {
        if (p.battingOrderPosition > currentMax) currentMax = p.battingOrderPosition;
      }
    }

    // DB check constraint caps batting_order at 30 and the league cap may be
    // tighter. Bail before emitting an event that the persistence layer would
    // reject; the SUBSTITUTION would still land in the event log and diverge
    // replay from the DB state.
    if (activePlayerIds.has(newBatterId) || currentMax >= maxBatters) return;

    const battingOrderPosition = currentMax + 1;

    const payload: SubstitutionPayload = {
      inPlayerId: newBatterId,
      substitutionType: SubstitutionType.LINEUP_EXTENSION,
      battingOrderPosition,
    };
    await recordEvent(EventType.SUBSTITUTION, gameState.inning, gameState.isTopOfInning, payload);

    // Persist the new batter to the local game_lineups mirror so post-game
    // consumers (MaxPreps export, season-stat rollups) see them alongside the
    // pre-game starters once the sync engine pushes it. A player may already
    // have a bench row (null batting order — e.g. a non-batting pitcher);
    // unique(game_id, player_id) forbids a second row, so that row is UPDATED
    // into the order instead. Offline-first like everything else on this
    // screen; the SUBSTITUTION event above remains the authoritative source
    // for live state and the shared stats derivers.
    try {
      const existingRow = observedLineupRows.find((row) => row.playerRemoteId === newBatterId);
      if (existingRow) {
        await database.write(async () => {
          await existingRow.update((r) => {
            r.battingOrder = battingOrderPosition;
            r.updatedAt = Date.now();
          });
        });
      } else {
        await addLineupRow({
          gameRemoteId: gameId,
          playerRemoteId: newBatterId,
          battingOrder: battingOrderPosition,
          isStarter: false,
          isGuest: false,
          countTowardStats: true,
        });
      }
    } catch (err) {
      // The SUBSTITUTION event above already keeps live play correct; log
      // with context so a missing post-game lineup row can be traced.
      console.warn(
        `Add Batter lineup row write failed game=${gameId} player=${newBatterId}:`,
        err,
      );
    }
    triggerSync().catch(console.warn);
  }

  // Only scan this far back when searching for an event to void. Typical
  // scorer Undo use lives within the last few events; a 64-event trailing
  // window covers well over an inning of activity while keeping the query
  // bounded. If no undoable event is found in the window, the button is a
  // no-op (rather than scanning thousands of events from earlier innings).
  const UNDO_WINDOW = 64;

  async function handleUndo() {
    if (!gameState) return;
    const eventsCollection = database.get<WdbGameEvent>('game_events');
    const recent = await eventsCollection
      .query(
        Q.where('game_remote_id', gameId),
        Q.sortBy('sequence_number', Q.desc),
        Q.take(UNDO_WINDOW),
      )
      .fetch();

    // Build the set of event IDs targeted by any EVENT_VOIDED in the
    // window so we skip already-voided events on the walk-back. We do
    // NOT attempt to handle "un-undo" (voiding a void to restore the
    // original) here because event-filters.ts doesn't add EVENT_VOIDED
    // rows to the replay accumulator, so voiding a void is a no-op at
    // replay time — treating it as a restore here would make the scorer
    // see different state than the stats modules.
    const voidedIds = new Set<string>();
    for (const e of recent) {
      if (e.eventType === EventType.EVENT_VOIDED) {
        const payload = e.payload as { voidedEventId?: string };
        if (payload.voidedEventId) voidedIds.add(payload.voidedEventId);
      }
    }

    // Already sorted descending, so iterate forward to find the most
    // recent non-correction, non-voided event.
    for (const e of recent) {
      if (e.eventType === EventType.EVENT_VOIDED) continue;
      if (e.eventType === EventType.PITCH_REVERTED) continue;
      if (voidedIds.has(e.remoteId)) continue;
      // Cascade-undo: when voiding a parent play, also void any linked
      // outcome events (BASERUNNER_OUT / BASERUNNER_ADVANCE with
      // relatedEventId === parent.id) so a single Undo tap retires the
      // full multi-event play (e.g. "Double + R1 thrown out at 3B").
      const linked = recent.filter((other) => {
        if (other.remoteId === e.remoteId) return false;
        if (voidedIds.has(other.remoteId)) return false;
        if (
          other.eventType !== EventType.BASERUNNER_OUT &&
          other.eventType !== EventType.BASERUNNER_ADVANCE
        ) return false;
        const p = other.payload as { relatedEventId?: string };
        return p.relatedEventId === e.remoteId;
      });
      for (const child of linked) {
        const childPayload: EventVoidedPayload = {
          voidedEventId: child.remoteId,
          voidedSequenceNumber: child.sequenceNumber,
        };
        await recordEvent(EventType.EVENT_VOIDED, gameState.inning, gameState.isTopOfInning, childPayload);
      }
      const payload: EventVoidedPayload = {
        voidedEventId: e.remoteId,
        voidedSequenceNumber: e.sequenceNumber,
      };
      await recordEvent(EventType.EVENT_VOIDED, gameState.inning, gameState.isTopOfInning, payload);
      return;
    }
  }

  async function handlePinchRunner(fromBase: 1 | 2 | 3, outRunnerId: string, inRunnerId: string) {
    if (!gameState) return;
    const payload: SubstitutionPayload = {
      inPlayerId: inRunnerId,
      outPlayerId: outRunnerId,
      substitutionType: SubstitutionType.PINCH_RUNNER,
      runnerBase: fromBase,
    };
    await recordEvent(EventType.SUBSTITUTION, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handlePickoffOut(fromBase: 1 | 2 | 3, runnerId: string) {
    if (!gameState) return;
    const payload: PickoffPayload = {
      runnerId,
      base: fromBase,
      ...pitcherAttribution,
      outcome: 'out',
    };
    await recordEvent(EventType.PICKOFF_ATTEMPT, gameState.inning, gameState.isTopOfInning, payload);
  }

  async function handleBalk() {
    if (!gameState) return;
    await recordEvent(EventType.BALK, gameState.inning, gameState.isTopOfInning, {
      ...pitcherAttribution,
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

  async function handleDoublePlay(runnerOut: { runnerId: string; base: 1 | 2 | 3 } | null) {
    if (!gameState) return;
    await recordEvent(EventType.DOUBLE_PLAY, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
      ...(runnerOut ? { runnerOutId: runnerOut.runnerId, runnerOutBase: runnerOut.base } : {}),
    });
  }

  async function handleTriplePlay() {
    if (!gameState) return;
    await recordEvent(EventType.TRIPLE_PLAY, gameState.inning, gameState.isTopOfInning, {
      ...halfAttribution,
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
      ...halfAttribution,
      outcome: details.outcome,
      fieldingSequence: details.fieldingSequence,
      errorBy: details.errorBy,
      isWildPitch: details.isWildPitch,
    };
    await recordEvent(EventType.DROPPED_THIRD_STRIKE, gameState.inning, gameState.isTopOfInning, payload);
  }

  // Runners currently on base — passed to PitchInput for the FC picker.
  // Memoised on the three runner IDs so a new array identity only
  // propagates when the underlying state actually changes; otherwise
  // PitchInput gets the same reference across re-renders.
  const firstRunner = gameState?.runnersOnBase.first ?? null;
  const secondRunner = gameState?.runnersOnBase.second ?? null;
  const thirdRunner = gameState?.runnersOnBase.third ?? null;
  const runnersOnBase = useMemo<{ base: 1 | 2 | 3; runnerId: string }[]>(() => {
    const out: { base: 1 | 2 | 3; runnerId: string }[] = [];
    if (firstRunner)  out.push({ base: 1, runnerId: firstRunner });
    if (secondRunner) out.push({ base: 2, runnerId: secondRunner });
    if (thirdRunner)  out.push({ base: 3, runnerId: thirdRunner });
    return out;
  }, [firstRunner, secondRunner, thirdRunner]);

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

      {/* League-rule advisories (mercy / run cap / regulation complete) */}
      {gameEndDecision && (
        <View className="mx-4 mt-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
          <Text className="text-sm font-semibold text-amber-900">End game?</Text>
          <Text className="text-xs text-amber-800 mt-0.5">{gameEndDecision.message}</Text>
        </View>
      )}
      {runCapReached && (
        <View className="mx-4 mt-2 p-3 bg-blue-50 border border-blue-300 rounded-lg flex-row items-center">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-blue-900">Run cap reached</Text>
            <Text className="text-xs text-blue-800 mt-0.5">
              This half-inning ends at the league run cap.
            </Text>
          </View>
          <TouchableOpacity
            onPress={confirmInningChange}
            className="ml-2 px-3 py-1.5 rounded-full bg-blue-600"
          >
            <Text className="text-xs font-semibold text-white">Switch sides</Text>
          </TouchableOpacity>
        </View>
      )}
      {ghostRunnerBase && (
        <View className="mx-4 mt-2 p-3 bg-purple-50 border border-purple-300 rounded-lg">
          <Text className="text-sm font-semibold text-purple-900">Ghost runner</Text>
          <Text className="text-xs text-purple-800 mt-0.5">
            Place a runner on {ghostRunnerBase === 1 ? '1st' : ghostRunnerBase === 2 ? '2nd' : '3rd'} via Substitution → Pinch Runner.
          </Text>
        </View>
      )}

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
          onRecordPinchRunner={handlePinchRunner}
          roster={roster}
        />
        {isSyncing ? (
          <Text className="text-xs text-blue-500">Syncing…</Text>
        ) : lastSyncError ? (
          <Text className="text-xs text-red-600">⚠ Sync failed</Text>
        ) : pendingEventsCount > 0 ? (
          <Text className="text-xs text-amber-600">{pendingEventsCount} unsynced</Text>
        ) : null}
      </View>

      {/* Game controls — manual half-inning switch (run cap, time limit, corrections) */}
      {gameStarted && gameState.outs < OUTS_PER_INNING && (
        <View className="flex-row items-center gap-2 px-4 pt-2">
          <TouchableOpacity
            onPress={confirmInningChange}
            className="px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200"
          >
            <Text className="text-xs font-semibold text-gray-700">End Inning ▸</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Pre-game lineup prompt — visible until a starting pitcher is known */}
      {gameState.currentPitcherId === null && (
        <TouchableOpacity
          className="mx-4 mt-2 p-3 bg-amber-50 border border-amber-300 rounded-lg flex-row items-center"
          onPress={() => setShowLineupModal(true)}
        >
          <Text className="flex-1 text-sm text-amber-900">
            <Text className="font-semibold">Set starting lineup</Text>
            <Text> — tap to pick your starting pitcher and leadoff batter.</Text>
          </Text>
          <Text className="text-amber-900 font-semibold">Set</Text>
        </TouchableOpacity>
      )}

      <LineupSetupModal
        visible={showLineupModal}
        roster={roster}
        onCancel={() => setShowLineupModal(false)}
        onSubmit={handleStartGame}
      />

      <GuestPlayerModal
        visible={showGuestModal}
        gameId={gameId}
        teamId={teamId}
        leagueId={leagueId}
        defaultCountTowardStats={leagueSettings.guests.countTowardStatsDefault}
        maxBatters={maxBatters}
        onClose={() => setShowGuestModal(false)}
      />

      {leagueSettings.guests.allowed && (
        <TouchableOpacity
          onPress={() => setShowGuestModal(true)}
          className="absolute top-2 right-3 px-3 py-1.5 rounded-full bg-emerald-700/90"
        >
          <Text className="text-xs font-semibold text-white">+ Guest</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() =>
          router.push({
            pathname: '/(tabs)/games/[gameId]/lineup',
            params: { gameId },
          })
        }
        className="absolute top-2 left-3 px-3 py-1.5 rounded-full bg-gray-700/90"
      >
        <Text className="text-xs font-semibold text-white">Lineup</Text>
      </TouchableOpacity>

      {/* Now batting — due-batter rotation with per-PA override */}
      {gameStarted && (weBat ? (
        <View className="flex-row items-center justify-between px-4 py-2 bg-emerald-50 border-t border-emerald-100">
          <Text className="flex-1 text-sm text-emerald-900" numberOfLines={1}>
            <Text className="text-xs text-emerald-700">Now batting{'  '}</Text>
            <Text className="font-semibold">
              {ourBatterId ? batterName(ourBatterId) : 'No batter set'}
            </Text>
            {batterOverrideId && batterOverrideId !== dueBatter?.playerId ? (
              <Text className="text-xs text-amber-700">{'  '}(override)</Text>
            ) : dueBatter && ourBatterId === dueBatter.playerId ? (
              <Text className="text-xs text-emerald-700">{'  '}(slot {dueBatter.battingOrder})</Text>
            ) : null}
          </Text>
          {battingSlots.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowBatterPicker(true)}
              className="ml-2 px-3 py-1 rounded-full bg-emerald-600"
            >
              <Text className="text-xs font-semibold text-white">Change</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View className="px-4 py-2 bg-gray-50 border-t border-gray-100">
          <Text className="text-xs text-gray-500">Opponent batting</Text>
        </View>
      ))}

      <BatterPickerModal
        visible={showBatterPicker}
        slots={battingSlots}
        batterName={batterName}
        dueBatterId={dueBatter?.playerId ?? null}
        selectedId={ourBatterId}
        onSelect={(playerId) => {
          setBatterOverrideId(playerId);
          setShowBatterPicker(false);
        }}
        onCancel={() => setShowBatterPicker(false)}
      />

      {/* Bottom: 3-outs prompt or pitch / outcome input. deriveGameState
          holds the half open until an explicit INNING_CHANGE, so at 3 outs
          the input surface is replaced by the switch-sides prompt. */}
      {gameState.outs >= OUTS_PER_INNING ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-2xl font-bold text-gray-900 mb-1">3 outs</Text>
          <Text className="text-sm text-gray-500 mb-5">
            {gameState.isTopOfInning ? 'Top' : 'Bottom'} {gameState.inning} is over.
          </Text>
          <TouchableOpacity
            onPress={() => { handleInningChange().catch(console.warn); }}
            className="w-full bg-blue-600 rounded-2xl py-4 items-center"
          >
            <Text className="text-white text-lg font-bold">Start {nextHalfLabel} ▸</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { handleUndo().catch(console.warn); }} className="mt-4 px-4 py-2">
            <Text className="text-gray-500 text-sm">Undo last event</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <PitchInput
        onRecordPitch={handlePitch}
        onRecordHit={handleHit}
        onRecordHitWithRunnerOutcomes={handleHitWithRunnerOutcomes}
        onRecordOut={handleOut}
        onRecordStrikeout={handleStrikeout}
        onRecordError={handleError}
        onRecordCatcherInterference={handleCatcherInterference}
        onRecordSacFly={handleSacrificeFly}
        onRecordSacBunt={handleSacrificeBunt}
        onRecordSacFlyFromOut={handleSacrificeFlyFromOut}
        onRecordSacBuntFromOut={handleSacrificeBuntFromOut}
        onRecordFieldersChoice={handleFieldersChoice}
        onRecordRunnerOut={handleRunnerOut}
        onRecordWildPitch={handleWildPitch}
        onRecordPassedBall={handlePassedBall}
        onRecordBalk={handleBalk}
        onRecordDoublePlay={handleDoublePlay}
        onRecordTriplePlay={handleTriplePlay}
        onRecordPitchingChange={handlePitchingChange}
        onRecordPinchHitter={handlePinchHitter}
        onRecordDefensiveSub={handleDefensiveSub}
        onRecordPositionChange={handlePositionChange}
        onRecordAddBatter={midGameExtensionAllowed ? handleAddBatter : undefined}
        activeBattingOrderPlayerIds={lineupRows
          .filter((l) => l.batting_order != null)
          .map((l) => l.player_id)}
        defensiveLineup={defensiveLineup}
        roster={roster}
        onUndoLastEvent={handleUndo}
        runnersOnBase={runnersOnBase}
        onRecordDroppedThirdStrike={handleDroppedThirdStrike}
        d3kModalOpen={showD3KModal}
        setD3KModalOpen={setShowD3KModal}
      />
      )}
    </View>
  );
}

/**
 * Batting-order picker for the per-PA override — lists the effective order
 * (subs folded in), highlights who is due up, and lets the scorer point the
 * rotation at a different batter when the lineup has drifted.
 */
function BatterPickerModal({
  visible,
  slots,
  batterName,
  dueBatterId,
  selectedId,
  onSelect,
  onCancel,
}: {
  visible: boolean;
  slots: BattingSlot[];
  batterName: (id: string) => string;
  dueBatterId: string | null;
  selectedId: string | null;
  onSelect: (playerId: string) => void;
  onCancel: () => void;
}) {
  const sorted = [...slots].sort((a, b) => a.battingOrder - b.battingOrder);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5" style={{ maxHeight: '75%' }}>
          <Text className="text-lg font-bold text-gray-900 mb-1">Now Batting</Text>
          <Text className="text-sm text-gray-500 mb-4">
            Pick who is at the plate. The rotation resumes from this batter
            after the plate appearance completes.
          </Text>
          <ScrollView className="max-h-96">
            <View className="gap-2">
              {sorted.map((slot) => {
                const isSelected = slot.playerId === selectedId;
                const isDue = slot.playerId === dueBatterId;
                return (
                  <TouchableOpacity
                    key={`${slot.battingOrder}-${slot.playerId}`}
                    className={`flex-row items-center rounded-xl px-4 py-3 border ${
                      isSelected ? 'bg-emerald-600 border-emerald-700' : 'bg-white border-gray-300'
                    }`}
                    onPress={() => onSelect(slot.playerId)}
                  >
                    <Text className={`w-8 font-bold ${isSelected ? 'text-white' : 'text-gray-400'}`}>
                      {slot.battingOrder}
                    </Text>
                    <Text className={`flex-1 font-semibold ${isSelected ? 'text-white' : 'text-gray-900'}`}>
                      {batterName(slot.playerId)}
                    </Text>
                    {isDue && (
                      <Text className={`text-xs font-semibold ${isSelected ? 'text-emerald-100' : 'text-emerald-700'}`}>
                        due up
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <TouchableOpacity
            className="mt-4 rounded-xl px-5 py-3 bg-gray-100 items-center"
            onPress={onCancel}
          >
            <Text className="text-gray-700 font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function LineupSetupModal({
  visible,
  roster,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  roster: RosterPlayer[];
  onCancel: () => void;
  onSubmit: (pitcherId: string, batterId: string) => void;
}) {
  const [pitcherId, setPitcherId] = useState<string | null>(null);
  const [batterId, setBatterId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPitcherId(null);
      setBatterId(null);
    }
  }, [visible]);

  const submittable = pitcherId !== null && batterId !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5" style={{ maxHeight: '85%' }}>
          <Text className="text-lg font-bold text-gray-900 mb-1">Starting Lineup</Text>
          <Text className="text-sm text-gray-500 mb-4">
            Pick your starting pitcher and leadoff batter. The opponent's
            leadoff is filled in from the web pre-game setup (or left blank
            if not entered) — this prevents opponent at-bats from being
            mis-credited to one of your players.
          </Text>

          {roster.length === 0 ? (
            <Text className="text-gray-500 text-sm py-4">
              No players loaded. Sync the roster first.
            </Text>
          ) : (
            <ScrollView className="max-h-96">
              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Your Starting Pitcher
              </Text>
              <View className="gap-2 mb-4">
                {roster.map((p) => (
                  <TouchableOpacity
                    key={`pitcher-${p.id}`}
                    className={`rounded-xl px-4 py-3 border ${
                      pitcherId === p.id
                        ? 'bg-blue-600 border-blue-700'
                        : 'bg-white border-gray-300'
                    }`}
                    onPress={() => setPitcherId(p.id)}
                  >
                    <Text className={pitcherId === p.id ? 'text-white font-semibold' : 'text-gray-900 font-semibold'}>
                      {p.jerseyNumber !== undefined ? `#${p.jerseyNumber} ` : ''}
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Your Leadoff Batter
              </Text>
              <View className="gap-2">
                {roster.map((p) => (
                  <TouchableOpacity
                    key={`batter-${p.id}`}
                    className={`rounded-xl px-4 py-3 border ${
                      batterId === p.id
                        ? 'bg-green-600 border-green-700'
                        : 'bg-white border-gray-300'
                    }`}
                    onPress={() => setBatterId(p.id)}
                  >
                    <Text className={batterId === p.id ? 'text-white font-semibold' : 'text-gray-900 font-semibold'}>
                      {p.jerseyNumber !== undefined ? `#${p.jerseyNumber} ` : ''}
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          <View className="flex-row gap-3 mt-4">
            <TouchableOpacity
              className="flex-1 rounded-xl px-5 py-3 bg-gray-100 items-center"
              onPress={onCancel}
            >
              <Text className="text-gray-700 font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 rounded-xl px-5 py-3 items-center ${submittable ? 'bg-emerald-600' : 'bg-emerald-300'}`}
              disabled={!submittable}
              onPress={() => {
                if (submittable && pitcherId && batterId) {
                  onSubmit(pitcherId, batterId);
                }
              }}
            >
              <Text className="text-white font-semibold">Start Game</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
