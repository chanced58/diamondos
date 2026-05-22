import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
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
import { EventType, PitchOutcome, HitType, HitTrajectory, AdvanceReason, type PitchType, weAreHome, getMaxBattingOrder, isMidGameExtensionAllowed, isDroppedThirdStrikeAllowed, evaluateGameEnd, shouldEndHalfForRunCap, ghostRunnerBaseForHalf } from '@baseball/shared';
import type { PitchThrownPayload, HitPayload, OutPayload, DroppedThirdStrikePayload, DroppedThirdStrikeOutcome, BaserunnerMovePayload, PickoffPayload, ScorePayload, EventVoidedPayload, SubstitutionPayload, PitchingChangePayload } from '@baseball/shared';
import { SubstitutionType } from '@baseball/shared';
import { useLeagueSettings } from '../../../../src/lib/league-settings';
import { database } from '../../../../src/db';
import type { GameEvent as WdbGameEvent } from '../../../../src/db/models/GameEvent';
import type { Game } from '../../../../src/db/models/Game';
import type { Player } from '../../../../src/db/models/Player';
import type { BattedOutType, RosterPlayer } from '../../../../src/features/scoring/PitchInput';
import { useSyncContext } from '../../../../src/providers/SyncProvider';
import { getSupabaseClient } from '../../../../src/lib/supabase';

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

  const { gameState, lineScore, loading } = useGameState(gameId, teamId);
  const { recordEvent } = useRecordEvent(gameId);
  const { isSyncing, lastSyncError, pendingEventsCount } = useSyncContext();
  const leagueSettings = useLeagueSettings(teamId);
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

  // currentPitcherId / currentBatterId are derived from GAME_START and
  // PITCH_THROWN events. When unset, emitted events carry undefined for
  // those fields (the payload types are optional) and stats modules skip
  // the event rather than attribute to a fake player. Scorer establishes
  // the starting values via the "Set Lineup" modal below.
  const currentPitcherId = gameState?.currentPitcherId ?? undefined;
  const currentBatterId = gameState?.currentBatterId ?? undefined;
  const defensiveLineup = useDefensiveLineup(gameId, roster);
  const [showLineupModal, setShowLineupModal] = useState(false);

  // Snapshot of the current batting order from Supabase game_lineups so the
  // Add Batter flow knows (a) which players are already in the order (to hide
  // them from the picker) and (b) the current max batting_order so the new
  // batter lands at end+1 without colliding with the unique constraint.
  // Refreshed after every successful add-batter insert.
  //
  // lineupLoaded / lineupLoadError gate the Add Batter flow: if the fetch
  // failed (transient network blip, RLS issue) we'd otherwise treat the empty
  // [] as "no batters yet" and pick batting_order=1 — colliding with the real
  // slot 1 occupant and re-offering starters in the picker. Block the flow
  // until we have a confirmed snapshot.
  const [lineupRows, setLineupRows] = useState<{ player_id: string; batting_order: number | null }[]>([]);
  const [lineupLoaded, setLineupLoaded] = useState(false);
  const [lineupLoadError, setLineupLoadError] = useState<string | null>(null);
  const refreshLineupRows = useMemo(() => async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('game_lineups')
      .select('player_id, batting_order')
      .eq('game_id', gameId);
    if (error || !data) {
      // eslint-disable-next-line no-console
      console.warn('Failed to load game_lineups snapshot', { gameId, error: error?.message });
      setLineupLoadError(error?.message ?? 'Failed to load lineup snapshot');
      setLineupLoaded(false);
      return;
    }
    setLineupRows(data);
    setLineupLoadError(null);
    setLineupLoaded(true);
  }, [gameId]);
  useEffect(() => { void refreshLineupRows(); }, [refreshLineupRows]);

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
      pitcherId: currentPitcherId,
      batterId: currentBatterId,
      outcome,
      ...(pitchType ? { pitchType } : {}),
    };
    await recordEvent(
      EventType.PITCH_THROWN,
      gameState.inning,
      gameState.isTopOfInning,
      payload,
    );

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

  async function handleError(errorBy: number) {
    if (!gameState) return;
    await recordEvent(EventType.FIELD_ERROR, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      errorBy,
    });
  }

  async function handleCatcherInterference() {
    if (!gameState) return;
    await recordEvent(EventType.CATCHER_INTERFERENCE, gameState.inning, gameState.isTopOfInning, {
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
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      ...(trajectory ? { trajectory } : {}),
    });
  }

  async function handleSacrificeBuntFromOut(outType: BattedOutType) {
    if (!gameState) return;
    const trajectory = trajectoryForOutType(outType);
    await recordEvent(EventType.SACRIFICE_BUNT, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
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

  // Runner thrown out advancing during a play (e.g., on a hit, sac fly,
  // wild pitch). Standalone BASERUNNER_OUT — the play itself is recorded
  // separately. game-state.ts removes the runner from the base and
  // increments outs; stats modules count it as an out without crediting CS.
  async function handleRunnerOut(runnerId: string, fromBase: 1 | 2 | 3) {
    if (!gameState) return;
    await recordEvent(EventType.BASERUNNER_OUT, gameState.inning, gameState.isTopOfInning, {
      runnerId,
      fromBase,
      pitcherId: currentPitcherId,
    });
  }

  async function handleStartGame(pitcherId: string, batterId: string) {
    if (!gameState) return;
    // Which team are we scoring? Check the Game row's locationType /
    // neutralHomeTeam fields so road games seed the away* lineup slots
    // instead of misattributing to home*.
    let isHome = true;
    try {
      const games = await database
        .get<Game>('games')
        .query(Q.where('remote_id', gameId))
        .fetch();
      const game = games[0];
      if (game) {
        isHome = weAreHome(game.locationType, game.neutralHomeTeam ?? null);
      }
    } catch (err) {
      console.warn('handleStartGame: could not resolve home/away, assuming home', err);
    }
    const payload = isHome
      ? { homeLineupPitcherId: pitcherId, homeLeadoffBatterId: batterId }
      : { awayLineupPitcherId: pitcherId, awayLeadoffBatterId: batterId };
    await recordEvent(EventType.GAME_START, gameState.inning, gameState.isTopOfInning, payload);
    setShowLineupModal(false);
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
   * replay AND upsert into game_lineups so MaxPreps export, season stats,
   * and post-game queries pick the new batter up.
   *
   * The unique(game_id, batting_order) constraint guarantees we can't
   * collide as long as we always use max+1; refreshLineupRows() pulls the
   * latest state after each insert.
   */
  async function handleAddBatter(newBatterId: string) {
    if (!gameState) return;
    // Don't add anyone until we have a confirmed snapshot of the existing
    // lineup. If the snapshot fetch failed we'd compute currentMax=0 and
    // collide with the real slot-1 occupant.
    if (!lineupLoaded) return;

    // Build the set of player ids already in the order, including pending
    // in-game LINEUP_EXTENSION events that haven't been reflected in the
    // Supabase snapshot yet (defense-in-depth against picker filter bypass
    // / two rapid taps before refreshLineupRows completes).
    const activePlayerIds = new Set(lineupRows.map((row) => row.player_id));

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

    // Persist the new batter to game_lineups so post-game consumers (MaxPreps
    // export, season-stat rollups) see them as a roster row alongside the
    // pre-game starters. is_starter=false marks them as a late addition.
    //
    // Offline-first trade-off: this upsert is a best-effort online write,
    // unlike everything else on this screen which lands in WatermelonDB
    // first and syncs later. The SUBSTITUTION event IS offline-first and is
    // the authoritative source for live state, batting rotation, and the
    // shared stats derivers — those all replay from game_events. If this
    // upsert fails (offline, transient RLS hiccup), the live game continues
    // to work correctly; only the post-game game_lineups table will be
    // missing the row until the scorer comes back online and the next
    // Add Batter (or any other UI) re-triggers refresh.
    //
    // A true offline-first solution would mirror game_lineups in
    // WatermelonDB and push via the sync engine, OR add a server-side
    // edge function that backfills game_lineups from LINEUP_EXTENSION
    // events. Either change is meaningful scope outside this PR — tracked
    // as follow-up.
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('game_lineups').upsert(
      {
        game_id: gameId,
        player_id: newBatterId,
        batting_order: battingOrderPosition,
        starting_position: null,
        is_starter: false,
      },
      { onConflict: 'game_id,batting_order' },
    );
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('Add Batter game_lineups upsert failed:', error.message);
    }
    void refreshLineupRows();
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

  async function handleDoublePlay(runnerOut: { runnerId: string; base: 1 | 2 | 3 } | null) {
    if (!gameState) return;
    await recordEvent(EventType.DOUBLE_PLAY, gameState.inning, gameState.isTopOfInning, {
      batterId: currentBatterId,
      pitcherId: currentPitcherId,
      ...(runnerOut ? { runnerOutId: runnerOut.runnerId, runnerOutBase: runnerOut.base } : {}),
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
        <View className="mx-4 mt-2 p-3 bg-blue-50 border border-blue-300 rounded-lg">
          <Text className="text-sm font-semibold text-blue-900">Run cap reached</Text>
          <Text className="text-xs text-blue-800 mt-0.5">
            Switch sides via the Inning Change control.
          </Text>
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
        teamId={teamId as string}
        defaultCountTowardStats={leagueSettings.guests.countTowardStatsDefault}
        onClose={() => setShowGuestModal(false)}
        onAdded={() => {
          // Refresh the local lineup snapshot so the new guest shows up in
          // any picker that's filtered by activeBattingOrderPlayerIds.
          void refreshLineupRows();
        }}
      />

      {leagueSettings.guests.allowed && (
        <TouchableOpacity
          onPress={() => setShowGuestModal(true)}
          className="absolute top-2 right-3 px-3 py-1.5 rounded-full bg-emerald-700/90"
        >
          <Text className="text-xs font-semibold text-white">+ Guest</Text>
        </TouchableOpacity>
      )}

      {/* Bottom: pitch / outcome input */}
      <PitchInput
        onRecordPitch={handlePitch}
        onRecordHit={handleHit}
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
        activeBattingOrderPlayerIds={lineupRows.map((l) => l.player_id)}
        defensiveLineup={defensiveLineup}
        roster={roster}
        onUndoLastEvent={handleUndo}
        runnersOnBase={runnersOnBase}
        onRecordDroppedThirdStrike={handleDroppedThirdStrike}
        d3kModalOpen={showD3KModal}
        setD3KModalOpen={setShowD3KModal}
      />
    </View>
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
