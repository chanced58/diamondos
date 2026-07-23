import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { HitType, PitchOutcome, PitchType } from '@baseball/shared';
import type { DefensiveLineup, DroppedThirdStrikeOutcome, ScoringConfig } from '@baseball/shared';
import { DefensiveDiamond } from './DefensiveDiamond';
import { StrikeZoneGrid } from './StrikeZoneGrid';
import {
  PILL_HIT_1B, PILL_HIT_2B, PILL_HIT_3B, PILL_HIT_HR,
  PILL_NEUTRAL_OUT, PILL_SACRIFICE, PILL_BASERUNNING_OUT, PILL_MULTI_OUT_PLAY, PILL_ROSTER,
  BUTTON_DISABLED,
} from './scoring-colors';

interface DroppedThirdStrikeDetails {
  outcome: DroppedThirdStrikeOutcome;
  fieldingSequence?: number[];
  errorBy?: number;
  isWildPitch?: boolean;
}

type Base = 1 | 2 | 3;

export type BattedOutType = 'groundout' | 'flyout' | 'lineout' | 'popout' | 'other';

export type RosterPlayer = {
  id: string;
  name: string;
  jerseyNumber?: number;
  /** Optional split-name fields for richer display (e.g., on the defensive diamond). */
  firstName?: string;
  lastName?: string;
  /** Player's primary defensive position (e.g., 'SS', 'CF'). Seeds the defensive alignment. */
  primaryPosition?: string | null;
};

/**
 * Per-runner outcome on a play whose batter-result stands but whose
 * existing runners diverge from the default auto-advance. Used by the
 * post-hit modal for 2B/3B hits with runners on base.
 *
 * - `auto`     — runner advances by the default amount (no event emitted).
 * - `held`     — runner stops at `toBase`, short of the default. Recorded
 *                as a BASERUNNER_ADVANCE event linked via relatedEventId.
 * - `thrown_out` — runner is thrown out advancing. Recorded as a
 *                BASERUNNER_OUT event linked via relatedEventId.
 */
export type RunnerOutcome = {
  runnerId: string;
  fromBase: Base;
} & (
  | { kind: 'auto' }
  | { kind: 'held'; toBase: 2 | 3 }
  | { kind: 'thrown_out' }
);

interface PitchInputProps {
  /** Per-game annotation settings (pitch type / pitch location / spray
   *  chart), set at Start Game and read back from the GAME_START event. */
  scoringConfig: ScoringConfig;
  onRecordPitch: (outcome: PitchOutcome, pitchType?: PitchType, zoneLocation?: number) => void;
  onRecordHit: (hitType: HitType) => void;
  /**
   * Optional: when present and the scorer taps 2B / 3B with runners on base,
   * the post-hit "runner outcomes" modal collects per-runner held / thrown-out
   * choices and the parent emits the HIT plus linked BASERUNNER_OUT /
   * BASERUNNER_ADVANCE events in one coordinated submission. Falls back to
   * onRecordHit when omitted or when no runners are on base (one-tap path).
   */
  onRecordHitWithRunnerOutcomes?: (hitType: HitType, outcomes: RunnerOutcome[]) => void;
  onRecordOut: (outType: BattedOutType) => void;
  // Walk and Strikeout no longer have manual buttons — auto-completion lives
  // in the parent's pitch handler. handleStrikeout is still passed because the
  // D3K modal's "Caught (regular K)" option resolves to a regular STRIKEOUT.
  onRecordStrikeout: () => void;
  onRecordError: (errorBy: number) => void;
  onRecordCatcherInterference: () => void;
  onRecordSacFly: () => void;
  onRecordSacBunt: () => void;
  /** Sacrifice fly chosen via the in-Out follow-up — carries the trajectory
   *  the scorer initially picked (groundout/flyout/lineout/popout/other) so
   *  the recorded payload preserves that context. */
  onRecordSacFlyFromOut?: (outType: BattedOutType) => void;
  /** Sacrifice bunt chosen via the in-Out follow-up — same trajectory carry-over. */
  onRecordSacBuntFromOut?: (outType: BattedOutType) => void;
  onRecordFieldersChoice: (runnerId: string, fromBase: Base) => void;
  /** Runner thrown out advancing during a play (e.g., on a hit, sac fly,
   *  wild pitch). Records BASERUNNER_OUT for the chosen runner. */
  onRecordRunnerOut: (runnerId: string, fromBase: Base) => void;
  onRecordWildPitch: () => void;
  onRecordPassedBall: () => void;
  onRecordBalk: () => void;
  onRecordDoublePlay: (runnerOut: { runnerId: string; base: Base } | null) => void;
  onRecordTriplePlay: () => void;
  onRecordPitchingChange: (newPitcherId: string) => void;
  onRecordPinchHitter: (newBatterId: string) => void;
  /** Defensive substitution: replace one fielder with another, optionally taking a new position. */
  onRecordDefensiveSub?: (outPlayerId: string, inPlayerId: string, newPosition?: string) => void;
  /** Position change: same player moves to a new defensive position. */
  onRecordPositionChange?: (playerId: string, newPosition: string) => void;
  /** Add a batter to the end of the order mid-game (late arrival, courtesy player). */
  onRecordAddBatter?: (newBatterId: string) => void;
  /** Player ids already in the active batting order — excluded from the Add Batter picker. */
  activeBattingOrderPlayerIds?: ReadonlyArray<string>;
  /** Current defensive alignment, shown above the defensive-sub / position-change pickers. */
  defensiveLineup?: DefensiveLineup | null;
  roster: RosterPlayer[];
  /** Per-player game pitch totals + compliance level, shown as badges in the
   *  pitching-change picker so the coach sees who is near/over their limit. */
  pitcherBadges?: Record<string, { count: number; level: 'ok' | 'warning' | 'danger' | 'over' }>;
  onUndoLastEvent: () => void;
  runnersOnBase: { base: Base; runnerId: string }[];
  onRecordDroppedThirdStrike?: (details: DroppedThirdStrikeDetails) => void;
  // Controlled modal state — parent opens the modal automatically when a
  // 3rd-strike pitch is recorded with D3K eligibility (per OBR 5.05(a)(2)).
  d3kModalOpen?: boolean;
  setD3KModalOpen?: (open: boolean) => void;
}

const PITCH_TYPES: Array<{ label: string; value: PitchType }> = [
  { label: 'FB', value: PitchType.FASTBALL },
  { label: 'CB', value: PitchType.CURVEBALL },
  { label: 'SL', value: PitchType.SLIDER },
  { label: 'CH', value: PitchType.CHANGEUP },
  { label: 'SI', value: PitchType.SINKER },
  { label: 'CT', value: PitchType.CUTTER },
  { label: 'SP', value: PitchType.SPLITTER },
  { label: 'KN', value: PitchType.KNUCKLEBALL },
];

const FIELDER_POSITIONS: Array<{ label: string; position: number }> = [
  { label: 'P',  position: 1 },
  { label: 'C',  position: 2 },
  { label: '1B', position: 3 },
  { label: '2B', position: 4 },
  { label: '3B', position: 5 },
  { label: 'SS', position: 6 },
  { label: 'LF', position: 7 },
  { label: 'CF', position: 8 },
  { label: 'RF', position: 9 },
];

const HIT_TYPES: Array<{ label: string; hitType: HitType; color: string }> = [
  { label: '1B', hitType: HitType.SINGLE, color: PILL_HIT_1B },
  { label: '2B', hitType: HitType.DOUBLE, color: PILL_HIT_2B },
  { label: '3B', hitType: HitType.TRIPLE, color: PILL_HIT_3B },
  { label: 'HR', hitType: HitType.HOME_RUN, color: PILL_HIT_HR },
];

const PITCH_OUTCOMES: Array<{ label: string; outcome: PitchOutcome; color: string }> = [
  { label: 'Called K', outcome: PitchOutcome.CALLED_STRIKE, color: 'bg-red-100 border-red-300 text-red-700' },
  { label: 'Swing K', outcome: PitchOutcome.SWINGING_STRIKE, color: 'bg-red-100 border-red-300 text-red-700' },
  { label: 'Ball', outcome: PitchOutcome.BALL, color: 'bg-green-100 border-green-300 text-green-700' },
  { label: 'Foul', outcome: PitchOutcome.FOUL, color: 'bg-yellow-100 border-yellow-300 text-yellow-700' },
  { label: 'Foul Tip', outcome: PitchOutcome.FOUL_TIP, color: 'bg-yellow-100 border-yellow-300 text-yellow-700' },
  { label: 'HBP', outcome: PitchOutcome.HIT_BY_PITCH, color: 'bg-orange-100 border-orange-300 text-orange-700' },
];

/**
 * Primary pitch and plate-appearance input interface.
 * Records individual pitches (ball/strike/foul) and plate outcomes (hit/out/walk/K).
 */
export function PitchInput({
  scoringConfig,
  onRecordPitch,
  onRecordHit,
  onRecordHitWithRunnerOutcomes,
  onRecordOut,
  onRecordStrikeout,
  onRecordError,
  onRecordCatcherInterference,
  onRecordSacFly,
  onRecordSacBunt,
  onRecordSacFlyFromOut,
  onRecordSacBuntFromOut,
  onRecordFieldersChoice,
  onRecordRunnerOut,
  onRecordWildPitch,
  onRecordPassedBall,
  onRecordBalk,
  onRecordDoublePlay,
  onRecordTriplePlay,
  onRecordPitchingChange,
  onRecordPinchHitter,
  onRecordDefensiveSub,
  onRecordPositionChange,
  onRecordAddBatter,
  activeBattingOrderPlayerIds,
  defensiveLineup,
  roster,
  pitcherBadges,
  onUndoLastEvent,
  runnersOnBase,
  onRecordDroppedThirdStrike,
  d3kModalOpen = false,
  setD3KModalOpen,
}: PitchInputProps) {
  const showD3KModal = d3kModalOpen;
  const setShowD3KModal = setD3KModalOpen ?? (() => {});
  const [showFCModal, setShowFCModal] = useState(false);
  const [showRunnerOutModal, setShowRunnerOutModal] = useState(false);
  // Pending HIT awaiting per-runner outcome confirmation (2B/3B with
  // runners on). null = modal closed; non-null = modal open for that hit
  // type. The choices map is keyed by runnerId.
  const [pendingHitWithRunners, setPendingHitWithRunners] = useState<HitType | null>(null);
  const [runnerOutcomeChoices, setRunnerOutcomeChoices] = useState<
    Record<string, RunnerOutcome>
  >({});
  const [showOutModal, setShowOutModal] = useState(false);
  // Two-step Out modal: step 1 picks trajectory, step 2 asks "was this a sac?".
  // null = step 1 visible; non-null = step 2 visible with the picked trajectory.
  const [pendingOutType, setPendingOutType] = useState<BattedOutType | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showDPModal, setShowDPModal] = useState(false);
  const [subModal, setSubModal] = useState<
    null | 'pinch_hitter' | 'pitching_change' | 'defensive' | 'position_change' | 'add_batter'
  >(null);
  // Defensive-sub / position-change picker state.
  const [defSubOutId, setDefSubOutId] = useState<string>('');
  const [defSubInId, setDefSubInId] = useState<string>('');
  const [defSubPosition, setDefSubPosition] = useState<string>('');
  const [selectedPitchType, setSelectedPitchType] = useState<PitchType | null>(null);
  const [zoneLocation, setZoneLocation] = useState<number | null>(null);
  const fcEligible = runnersOnBase.length > 0;

  // Every plate-appearance result resets the per-pitch annotation state so
  // the next pitch starts clean.
  function resetAfterResult() {
    setSelectedPitchType(null);
    setZoneLocation(null);
  }

  function handlePitchOutcome(outcome: PitchOutcome) {
    onRecordPitch(outcome, selectedPitchType ?? undefined, zoneLocation ?? undefined);
    setSelectedPitchType(null);
    setZoneLocation(null);
  }

  function handleErrorPick(errorBy: number) {
    setShowErrorModal(false);
    onRecordError(errorBy);
    resetAfterResult();
  }

  function handleDPTap() {
    if (runnersOnBase.length === 0) {
      // No runners to force out; fall through to ambiguous DP (legacy).
      onRecordDoublePlay(null);
      resetAfterResult();
    } else {
      setShowDPModal(true);
    }
  }

  function handleDPPick(runnerId: string, base: Base) {
    setShowDPModal(false);
    onRecordDoublePlay({ runnerId, base });
    resetAfterResult();
  }

  function handleSubPick(playerId: string) {
    const mode = subModal;
    setSubModal(null);
    if (mode === 'pinch_hitter') onRecordPinchHitter(playerId);
    else if (mode === 'pitching_change') onRecordPitchingChange(playerId);
    else if (mode === 'add_batter' && onRecordAddBatter) onRecordAddBatter(playerId);
  }

  function openDefensiveSubModal() {
    setDefSubOutId('');
    setDefSubInId('');
    setDefSubPosition('');
    setSubModal('defensive');
  }

  function openPositionChangeModal() {
    setDefSubOutId('');
    setDefSubPosition('');
    setSubModal('position_change');
  }

  function submitDefensiveSub() {
    if (!onRecordDefensiveSub || !defSubOutId || !defSubInId) return;
    onRecordDefensiveSub(defSubOutId, defSubInId, defSubPosition || undefined);
    setSubModal(null);
  }

  function submitPositionChange() {
    if (!onRecordPositionChange || !defSubOutId || !defSubPosition) return;
    onRecordPositionChange(defSubOutId, defSubPosition);
    setSubModal(null);
  }

  function handleFCPick(runnerId: string, fromBase: Base) {
    setShowFCModal(false);
    onRecordFieldersChoice(runnerId, fromBase);
    resetAfterResult();
  }

  function handleRunnerOutPick(runnerId: string, fromBase: Base) {
    setShowRunnerOutModal(false);
    onRecordRunnerOut(runnerId, fromBase);
  }

  function handleHitTap(hitType: HitType) {
    const supportsOutcomes = !!onRecordHitWithRunnerOutcomes;
    const needsPrompt =
      supportsOutcomes &&
      runnersOnBase.length > 0 &&
      (hitType === HitType.DOUBLE || hitType === HitType.TRIPLE);
    if (!needsPrompt) {
      onRecordHit(hitType);
      resetAfterResult();
      return;
    }
    // Seed every runner with the default "auto" choice.
    const seed: Record<string, RunnerOutcome> = {};
    for (const r of runnersOnBase) {
      seed[r.runnerId] = { runnerId: r.runnerId, fromBase: r.base, kind: 'auto' };
    }
    setRunnerOutcomeChoices(seed);
    setPendingHitWithRunners(hitType);
  }

  function setRunnerChoice(runnerId: string, fromBase: Base, kind: 'auto' | 'held' | 'thrown_out') {
    setRunnerOutcomeChoices((prev) => {
      const next = { ...prev };
      if (kind === 'auto') {
        next[runnerId] = { runnerId, fromBase, kind: 'auto' };
      } else if (kind === 'thrown_out') {
        next[runnerId] = { runnerId, fromBase, kind: 'thrown_out' };
      } else {
        // "Held" — pick the next base the runner could realistically stop at.
        // For a runner on 1B that's 2B; for a runner on 2B that's 3B. Runners
        // on 3B can't "hold" further (3B is their default; advancing is to
        // home, which is the "auto" outcome).
        const toBase: 2 | 3 = fromBase === 1 ? 2 : 3;
        next[runnerId] = { runnerId, fromBase, kind: 'held', toBase };
      }
      return next;
    });
  }

  function confirmHitWithRunners() {
    if (!pendingHitWithRunners || !onRecordHitWithRunnerOutcomes) {
      setPendingHitWithRunners(null);
      return;
    }
    const outcomes = Object.values(runnerOutcomeChoices);
    onRecordHitWithRunnerOutcomes(pendingHitWithRunners, outcomes);
    setPendingHitWithRunners(null);
    setRunnerOutcomeChoices({});
    resetAfterResult();
  }

  function cancelHitWithRunners() {
    setPendingHitWithRunners(null);
    setRunnerOutcomeChoices({});
  }

  // Step 1: scorer picks the trajectory of the out. We stash it and advance
  // to step 2 where the scorer confirms it was a regular out or upgrades it
  // to a sacrifice fly/bunt.
  function handleOutPick(outType: BattedOutType) {
    setPendingOutType(outType);
  }

  // Step 2 (regular path): confirm the stashed trajectory as a plain OUT.
  function confirmRegularOut() {
    if (!pendingOutType) return;
    const t = pendingOutType;
    closeOutModal();
    onRecordOut(t);
    resetAfterResult();
  }

  // Step 2 (sac fly path): record SACRIFICE_FLY, carrying the trajectory
  // the scorer just picked as additional payload context.
  function confirmSacFlyFromOut() {
    if (!pendingOutType) return;
    const t = pendingOutType;
    closeOutModal();
    if (onRecordSacFlyFromOut) onRecordSacFlyFromOut(t);
    else onRecordSacFly();
    resetAfterResult();
  }

  // Step 2 (sac bunt path): record SACRIFICE_BUNT with trajectory context.
  function confirmSacBuntFromOut() {
    if (!pendingOutType) return;
    const t = pendingOutType;
    closeOutModal();
    if (onRecordSacBuntFromOut) onRecordSacBuntFromOut(t);
    else onRecordSacBunt();
    resetAfterResult();
  }

  function closeOutModal() {
    setShowOutModal(false);
    setPendingOutType(null);
  }

  function handleD3KOutcome(details: DroppedThirdStrikeDetails) {
    setShowD3KModal(false);
    onRecordDroppedThirdStrike?.(details);
  }

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Undo — voids the most recent live event (EVENT_VOIDED) */}
      <View className="px-4 pt-3 flex-row justify-end">
        <TouchableOpacity
          className="border border-gray-300 bg-white rounded-lg px-3 py-1.5"
          onPress={onUndoLastEvent}
        >
          <Text className="text-xs font-semibold text-gray-700">↩ Undo</Text>
        </TouchableOpacity>
      </View>

      {/* Pitch type picker — optional per game setting; latches until the next recorded pitch */}
      {scoringConfig.pitchTypeEnabled && (
        <View className="px-4 pt-3">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Pitch type
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {PITCH_TYPES.map(({ label, value }) => {
              const selected = selectedPitchType === value;
              return (
                <TouchableOpacity
                  key={value}
                  className={`rounded-lg px-3 py-1.5 border ${
                    selected ? 'bg-brand-700 border-brand-800' : 'bg-white border-gray-300'
                  }`}
                  onPress={() => setSelectedPitchType(selected ? null : value)}
                >
                  <Text className={`text-xs font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Pitch location — optional per game setting; once enabled, required
          before the pitch-outcome buttons below become tappable. */}
      {scoringConfig.pitchLocationEnabled && (
        <View className="px-4 pt-4">
          <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Pitch location
          </Text>
          <StrikeZoneGrid selected={zoneLocation} onSelect={setZoneLocation} />
        </View>
      )}

      {/* Pitch-by-pitch section. Pitch type / location are informational
          annotations only, even when the per-game toggle is on — they never
          block recording a pitch. */}
      <View className="px-4 pt-4">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Record pitch
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {PITCH_OUTCOMES.map(({ label, outcome, color }) => (
            <TouchableOpacity
              key={outcome}
              className={`border rounded-xl px-4 py-3 ${color}`}
              onPress={() => handlePitchOutcome(outcome)}
            >
              <Text className="font-semibold text-sm">{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            className="border rounded-xl px-4 py-3 bg-amber-100 border-amber-300"
            onPress={onRecordWildPitch}
          >
            <Text className="font-semibold text-sm text-amber-700">WP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-xl px-4 py-3 bg-yellow-100 border-yellow-300"
            onPress={onRecordPassedBall}
          >
            <Text className="font-semibold text-sm text-yellow-700">PB</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hit type — OBR 9.06 requires explicit 1B/2B/3B/HR */}
      <View className="px-4 pt-5">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Hit
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {HIT_TYPES.map(({ label, hitType, color }) => (
            <OutcomeButton
              key={hitType}
              label={label}
              onPress={() => handleHitTap(hitType)}
              color={color}
            />
          ))}
        </View>
      </View>

      {/* Other plate appearance outcomes */}
      <View className="px-4 pt-5">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Other plate appearance result
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <OutcomeButton label="Out" onPress={() => setShowOutModal(true)} color={PILL_NEUTRAL_OUT} />
          <OutcomeButton label="Error" onPress={() => setShowErrorModal(true)} color="bg-orange-600" />
          <OutcomeButton label="Catcher Interference" onPress={onRecordCatcherInterference} color="bg-rose-500" />
          <OutcomeButton label="Sac Fly" onPress={onRecordSacFly} color={PILL_SACRIFICE} />
          <OutcomeButton label="Sac Bunt" onPress={onRecordSacBunt} color={PILL_SACRIFICE} />
          {fcEligible && (
            <OutcomeButton
              label="Fielder's Choice"
              onPress={() => setShowFCModal(true)}
              color={PILL_BASERUNNING_OUT}
            />
          )}
          {fcEligible && (
            <OutcomeButton
              label="Runner Out"
              onPress={() => setShowRunnerOutModal(true)}
              color={PILL_BASERUNNING_OUT}
            />
          )}
          <OutcomeButton label="Balk" onPress={onRecordBalk} color="bg-pink-600" />
          <OutcomeButton label="Double Play" onPress={handleDPTap} color={PILL_MULTI_OUT_PLAY} />
          <OutcomeButton
            label="Triple Play"
            onPress={() => { onRecordTriplePlay(); resetAfterResult(); }}
            color={PILL_MULTI_OUT_PLAY}
          />
          <OutcomeButton label="Pinch Hitter" onPress={() => setSubModal('pinch_hitter')} color={PILL_ROSTER} />
          <OutcomeButton label="Pitching Change" onPress={() => setSubModal('pitching_change')} color={PILL_ROSTER} />
          {onRecordDefensiveSub && (
            <OutcomeButton label="Defensive Sub" onPress={openDefensiveSubModal} color={PILL_ROSTER} />
          )}
          {onRecordPositionChange && (
            <OutcomeButton label="Position Change" onPress={openPositionChangeModal} color={PILL_ROSTER} />
          )}
          {onRecordAddBatter && (
            <OutcomeButton label="Add Batter" onPress={() => setSubModal('add_batter')} color={PILL_ROSTER} />
          )}
        </View>
      </View>

      {/* Dropped third strike outcome modal */}
      <Modal
        visible={showD3KModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowD3KModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            <Text className="text-lg font-bold text-gray-900 mb-1">
              Third Strike
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              Did the catcher catch it, or did it get away?
            </Text>

            <View className="gap-3">
              <TouchableOpacity
                className="bg-red-600 rounded-xl px-5 py-4"
                onPress={() => {
                  setShowD3KModal(false);
                  onRecordStrikeout();
                }}
              >
                <Text className="text-white font-semibold">Caught (regular K)</Text>
                <Text className="text-white/70 text-xs mt-0.5">
                  Catcher caught the third strike — batter is out
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-gray-600 rounded-xl px-5 py-4"
                onPress={() => handleD3KOutcome({
                  outcome: 'thrown_out',
                  fieldingSequence: [2, 3],
                })}
              >
                <Text className="text-white font-semibold">Batter Out (K 2-3)</Text>
                <Text className="text-white/70 text-xs mt-0.5">
                  Catcher threw batter out at first
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-orange-600 rounded-xl px-5 py-4"
                onPress={() => handleD3KOutcome({
                  outcome: 'reached_on_error',
                  errorBy: 2,
                })}
              >
                <Text className="text-white font-semibold">Safe - Error</Text>
                <Text className="text-white/70 text-xs mt-0.5">
                  Batter reached on fielding error
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-amber-600 rounded-xl px-5 py-4"
                onPress={() => handleD3KOutcome({
                  outcome: 'reached_wild_pitch',
                  isWildPitch: true,
                })}
              >
                <Text className="text-white font-semibold">Safe - Wild Pitch</Text>
                <Text className="text-white/70 text-xs mt-0.5">
                  Batter reached on wild pitch
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="bg-yellow-600 rounded-xl px-5 py-4"
                onPress={() => handleD3KOutcome({
                  outcome: 'reached_wild_pitch',
                  isWildPitch: false,
                })}
              >
                <Text className="text-white font-semibold">Safe - Passed Ball</Text>
                <Text className="text-white/70 text-xs mt-0.5">
                  Batter reached on passed ball
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              className="mt-4 py-3 items-center"
              onPress={() => setShowD3KModal(false)}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Double-play runner picker: which runner was also retired? */}
      <Modal
        visible={showDPModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDPModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            <Text className="text-lg font-bold text-gray-900 mb-1">Double Play</Text>
            <Text className="text-sm text-gray-500 mb-4">
              Batter is out. Which runner was retired on the second out?
            </Text>
            <View className="gap-3">
              {runnersOnBase.map(({ base, runnerId }) => (
                <TouchableOpacity
                  key={base}
                  className="bg-zinc-700 rounded-xl px-5 py-4"
                  onPress={() => handleDPPick(runnerId, base)}
                >
                  <Text className="text-white font-semibold">
                    Runner on {base === 1 ? '1st' : base === 2 ? '2nd' : '3rd'} retired
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity className="mt-4 py-3 items-center" onPress={() => setShowDPModal(false)}>
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Error fielder picker: OBR 9.12 — error must be charged to a position */}
      <Modal
        visible={showErrorModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowErrorModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            <Text className="text-lg font-bold text-gray-900 mb-1">Error</Text>
            <Text className="text-sm text-gray-500 mb-4">
              Which fielder committed the error?
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {FIELDER_POSITIONS.map(({ label, position }) => (
                <TouchableOpacity
                  key={position}
                  className="bg-orange-600 rounded-xl px-4 py-3"
                  onPress={() => handleErrorPick(position)}
                >
                  <Text className="text-white font-semibold">
                    {position} — {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity className="mt-4 py-3 items-center" onPress={() => setShowErrorModal(false)}>
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Substitution / pitching change / defensive sub / position change */}
      <Modal
        visible={subModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSubModal(null)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5" style={{ maxHeight: '90%' }}>
            <Text className="text-lg font-bold text-gray-900 mb-1">
              {subModal === 'pinch_hitter'   ? 'Pinch Hitter' :
               subModal === 'pitching_change' ? 'Pitching Change' :
               subModal === 'defensive'       ? 'Defensive Substitution' :
               subModal === 'position_change' ? 'Position Change' :
               subModal === 'add_batter'      ? 'Add Batter' : ''}
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              {subModal === 'pinch_hitter'
                ? 'Who is coming in to bat?'
                : subModal === 'pitching_change'
                ? 'Who is coming in to pitch?'
                : subModal === 'defensive'
                ? 'Replace a fielder with a player from the roster.'
                : subModal === 'position_change'
                ? 'Move a player to a different defensive position.'
                : subModal === 'add_batter'
                ? 'Add a batter to the end of the order (late arrival, courtesy player).'
                : ''}
            </Text>

            <ScrollView style={{ maxHeight: 540 }}>
              {(subModal === 'defensive' || subModal === 'position_change') && defensiveLineup && (
                <View className="mb-4">
                  <DefensiveDiamond lineup={defensiveLineup} />
                </View>
              )}

              {(subModal === 'pinch_hitter' || subModal === 'pitching_change' || subModal === 'add_batter') && (() => {
                // For add_batter, hide players already in the order so the
                // coach can't accidentally double-add a starter.
                const filteredRoster = subModal === 'add_batter' && activeBattingOrderPlayerIds
                  ? roster.filter((p) => !activeBattingOrderPlayerIds.includes(p.id))
                  : roster;
                if (filteredRoster.length === 0) {
                  return (
                    <Text className="text-gray-500 text-sm py-4">
                      {subModal === 'add_batter'
                        ? 'Every roster player is already in the order.'
                        : 'No players loaded. Sync the roster first.'}
                    </Text>
                  );
                }
                const buttonColor = 'bg-sky-700';
                return (
                  <View className="gap-2">
                    {filteredRoster.map((p) => {
                      // Pitch-count badge (pitching change only): total thrown
                      // this game, colored by the league compliance rule.
                      const badge =
                        subModal === 'pitching_change' ? pitcherBadges?.[p.id] : undefined;
                      const showBadge = badge && (badge.count > 0 || badge.level !== 'ok');
                      return (
                        <TouchableOpacity
                          key={p.id}
                          className={`${buttonColor} rounded-xl px-4 py-3 flex-row items-center`}
                          onPress={() => handleSubPick(p.id)}
                        >
                          <Text className="flex-1 text-white font-semibold text-base">
                            {p.jerseyNumber !== undefined ? `#${p.jerseyNumber} ` : ''}
                            {p.name}
                          </Text>
                          {showBadge && (
                            <View
                              className={`px-2 py-0.5 rounded-full ${
                                badge.level === 'over' || badge.level === 'danger'
                                  ? 'bg-red-200'
                                  : badge.level === 'warning'
                                    ? 'bg-amber-200'
                                    : 'bg-white/20'
                              }`}
                            >
                              <Text
                                className={`text-xs font-semibold ${
                                  badge.level === 'over' || badge.level === 'danger'
                                    ? 'text-red-900'
                                    : badge.level === 'warning'
                                      ? 'text-amber-900'
                                      : 'text-white'
                                }`}
                              >
                                {badge.count}p{badge.level === 'over' ? ' • over limit' : badge.level === 'danger' ? ' • at limit' : ''}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              })()}

              {subModal === 'defensive' && (
                <>
                  <PlayerPickerSection
                    label="Out (leaving the game)"
                    selectedId={defSubOutId}
                    onSelect={setDefSubOutId}
                    roster={roster}
                  />
                  <PlayerPickerSection
                    label="In (entering the game)"
                    selectedId={defSubInId}
                    onSelect={setDefSubInId}
                    roster={roster.filter((r) => r.id !== defSubOutId)}
                  />
                  <PositionPickerSection
                    label="New position (optional)"
                    selectedAbbr={defSubPosition}
                    onSelect={setDefSubPosition}
                    optional
                  />
                </>
              )}

              {subModal === 'position_change' && (
                <>
                  <PlayerPickerSection
                    label="Player"
                    selectedId={defSubOutId}
                    onSelect={setDefSubOutId}
                    roster={roster}
                  />
                  <PositionPickerSection
                    label="New position"
                    selectedAbbr={defSubPosition}
                    onSelect={setDefSubPosition}
                  />
                </>
              )}
            </ScrollView>

            {(subModal === 'defensive' || subModal === 'position_change') && (
              <View className="flex-row gap-3 mt-4">
                <TouchableOpacity
                  className={`flex-1 rounded-xl py-3 items-center ${
                    (subModal === 'defensive' ? defSubOutId && defSubInId : defSubOutId && defSubPosition)
                      ? 'bg-gray-900'
                      : 'bg-gray-300'
                  }`}
                  disabled={
                    subModal === 'defensive'
                      ? !defSubOutId || !defSubInId
                      : !defSubOutId || !defSubPosition
                  }
                  onPress={subModal === 'defensive' ? submitDefensiveSub : submitPositionChange}
                >
                  <Text className="text-white font-semibold">Record</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity className="mt-3 py-3 items-center" onPress={() => setSubModal(null)}>
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Out picker — two-step:
       *   Step 1: trajectory of the batted-ball out
       *   Step 2: was it a sacrifice (fly / bunt) or a regular out?
       *  Step 2 lets the scorer upgrade the play after seeing how it unfolded
       *  (e.g. tapped Flyout, then realized the runner from 3rd scored). */}
      <Modal
        visible={showOutModal}
        transparent
        animationType="slide"
        onRequestClose={closeOutModal}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            {pendingOutType === null ? (
              <>
                <Text className="text-lg font-bold text-gray-900 mb-1">Out</Text>
                <Text className="text-sm text-gray-500 mb-4">
                  How was the batter retired?
                </Text>

                <View className="gap-3">
                  <TouchableOpacity className="bg-gray-600 rounded-xl px-5 py-4" onPress={() => handleOutPick('groundout')}>
                    <Text className="text-white font-semibold">Groundout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="bg-gray-600 rounded-xl px-5 py-4" onPress={() => handleOutPick('flyout')}>
                    <Text className="text-white font-semibold">Flyout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="bg-gray-600 rounded-xl px-5 py-4" onPress={() => handleOutPick('lineout')}>
                    <Text className="text-white font-semibold">Lineout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="bg-gray-600 rounded-xl px-5 py-4" onPress={() => handleOutPick('popout')}>
                    <Text className="text-white font-semibold">Popout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="bg-gray-500 rounded-xl px-5 py-4" onPress={() => handleOutPick('other')}>
                    <Text className="text-white font-semibold">Other</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity className="mt-4 py-3 items-center" onPress={closeOutModal}>
                  <Text className="text-gray-500 font-semibold">Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text className="text-lg font-bold text-gray-900 mb-1">
                  {outTypeLabel(pendingOutType)} — sacrifice?
                </Text>
                <Text className="text-sm text-gray-500 mb-4">
                  Tag this {outTypeLabel(pendingOutType).toLowerCase()} as a
                  sacrifice fly or bunt, or record it as a regular out.
                </Text>

                <View className="gap-3">
                  <TouchableOpacity
                    className="bg-gray-700 rounded-xl px-5 py-4"
                    onPress={confirmRegularOut}
                  >
                    <Text className="text-white font-semibold">Regular out</Text>
                    <Text className="text-white/70 text-xs mt-0.5">
                      Records a normal {outTypeLabel(pendingOutType).toLowerCase()} (counts as an at-bat)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className="bg-teal-600 rounded-xl px-5 py-4"
                    onPress={confirmSacFlyFromOut}
                  >
                    <Text className="text-white font-semibold">Sacrifice fly</Text>
                    <Text className="text-white/70 text-xs mt-0.5">
                      Runner scored from 3rd on the catch — PA but not an AB
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className="bg-teal-700 rounded-xl px-5 py-4"
                    onPress={confirmSacBuntFromOut}
                  >
                    <Text className="text-white font-semibold">Sacrifice bunt</Text>
                    <Text className="text-white/70 text-xs mt-0.5">
                      Bunt out that intentionally advanced a runner — PA but not an AB
                    </Text>
                  </TouchableOpacity>
                </View>

                <View className="flex-row justify-between items-center mt-4">
                  <TouchableOpacity className="py-3" onPress={() => setPendingOutType(null)}>
                    <Text className="text-gray-500 font-semibold">← Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity className="py-3" onPress={closeOutModal}>
                    <Text className="text-gray-500 font-semibold">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Fielder's choice: scorer picks which runner was forced out */}
      <Modal
        visible={showFCModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFCModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            <Text className="text-lg font-bold text-gray-900 mb-1">
              Fielder's Choice
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              Which runner was retired? Batter reaches first base.
            </Text>

            <View className="gap-3">
              {runnersOnBase.map(({ base, runnerId }) => (
                <TouchableOpacity
                  key={base}
                  className="bg-rose-700 rounded-xl px-5 py-4"
                  onPress={() => handleFCPick(runnerId, base)}
                >
                  <Text className="text-white font-semibold">
                    Runner on {baseLabel(base)} retired
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className="mt-4 py-3 items-center"
              onPress={() => setShowFCModal(false)}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Runner thrown out advancing — records BASERUNNER_OUT for the
       *  picked runner. Use after a play (hit, sac, wild pitch, etc.)
       *  when a runner was thrown out trying to take an extra base. */}
      <Modal
        visible={showRunnerOutModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRunnerOutModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            <Text className="text-lg font-bold text-gray-900 mb-1">
              Runner Thrown Out
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              Which runner was thrown out advancing during the play?
            </Text>

            <View className="gap-3">
              {runnersOnBase.map(({ base, runnerId }) => (
                <TouchableOpacity
                  key={base}
                  className="bg-rose-700 rounded-xl px-5 py-4"
                  onPress={() => handleRunnerOutPick(runnerId, base)}
                >
                  <Text className="text-white font-semibold">
                    Runner on {baseLabel(base)} thrown out
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className="mt-4 py-3 items-center"
              onPress={() => setShowRunnerOutModal(false)}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Per-runner outcomes prompt for 2B/3B with runners on base.
       *  Records the HIT plus any linked BASERUNNER_OUT / BASERUNNER_ADVANCE
       *  events (via relatedEventId) so the platform shows e.g.
       *  "Double (Runner from 2nd held at 3B)" in the play feed. */}
      <Modal
        visible={pendingHitWithRunners !== null}
        transparent
        animationType="slide"
        onRequestClose={cancelHitWithRunners}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            <Text className="text-lg font-bold text-gray-900 mb-1">
              {pendingHitWithRunners === HitType.TRIPLE ? 'Triple' : 'Double'} — Runner Outcomes
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              For each runner on base, choose what happened. Default is the
              standard advance.
            </Text>

            <ScrollView className="max-h-96">
              {runnersOnBase.map(({ base, runnerId }) => {
                const choice = runnerOutcomeChoices[runnerId];
                const kind = choice?.kind ?? 'auto';
                // "Held" only makes sense when the runner could stop short
                // of the default end base. A runner on 3B has no shorter
                // advance than scoring, so we suppress that option.
                const canHold = base === 1 || base === 2;
                return (
                  <View key={runnerId} className="mb-4 border border-gray-200 rounded-xl p-3">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">
                      Runner on {baseLabel(base)}
                    </Text>
                    <View className="flex-row flex-wrap gap-2">
                      <TouchableOpacity
                        className={`px-3 py-2 rounded-lg ${kind === 'auto' ? 'bg-brand-600' : 'bg-gray-200'}`}
                        onPress={() => setRunnerChoice(runnerId, base, 'auto')}
                      >
                        <Text className={kind === 'auto' ? 'text-white font-semibold' : 'text-gray-700'}>
                          Advanced as expected
                        </Text>
                      </TouchableOpacity>
                      {canHold && (
                        <TouchableOpacity
                          className={`px-3 py-2 rounded-lg ${kind === 'held' ? 'bg-amber-600' : 'bg-gray-200'}`}
                          onPress={() => setRunnerChoice(runnerId, base, 'held')}
                        >
                          <Text className={kind === 'held' ? 'text-white font-semibold' : 'text-gray-700'}>
                            Held at {base === 1 ? '2B' : '3B'}
                          </Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        className={`px-3 py-2 rounded-lg ${kind === 'thrown_out' ? 'bg-rose-700' : 'bg-gray-200'}`}
                        onPress={() => setRunnerChoice(runnerId, base, 'thrown_out')}
                      >
                        <Text className={kind === 'thrown_out' ? 'text-white font-semibold' : 'text-gray-700'}>
                          Thrown out
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              className="bg-brand-600 rounded-xl px-5 py-4 mt-2"
              onPress={confirmHitWithRunners}
            >
              <Text className="text-white font-semibold text-center">
                Confirm {pendingHitWithRunners === HitType.TRIPLE ? 'Triple' : 'Double'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="mt-2 py-3 items-center"
              onPress={cancelHitWithRunners}
            >
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function baseLabel(base: Base): string {
  switch (base) {
    case 1: return '1st';
    case 2: return '2nd';
    case 3: return '3rd';
  }
}

function outTypeLabel(outType: BattedOutType): string {
  switch (outType) {
    case 'groundout': return 'Groundout';
    case 'flyout':    return 'Flyout';
    case 'lineout':   return 'Lineout';
    case 'popout':    return 'Popout';
    case 'other':     return 'Out';
  }
}

function OutcomeButton({
  label,
  onPress,
  color,
  disabled,
}: {
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      className={`${color} rounded-xl px-5 py-3.5 ${disabled ? BUTTON_DISABLED : ''}`}
      onPress={onPress}
      disabled={disabled}
    >
      <Text className="text-white font-semibold">{label}</Text>
    </TouchableOpacity>
  );
}

function PlayerPickerSection({
  label,
  selectedId,
  onSelect,
  roster,
}: {
  label: string;
  selectedId: string;
  onSelect: (id: string) => void;
  roster: RosterPlayer[];
}) {
  return (
    <View className="mb-4">
      <Text className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">{label}</Text>
      {roster.length === 0 ? (
        <Text className="text-gray-500 text-sm py-2">No players available.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {roster.map((p) => {
            const selected = p.id === selectedId;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => onSelect(p.id)}
                className={`rounded-lg px-3 py-2 border ${
                  selected ? 'bg-brand-700 border-brand-500' : 'bg-white border-gray-300'
                }`}
              >
                <Text className={`text-sm font-medium ${selected ? 'text-white' : 'text-gray-700'}`}>
                  {p.jerseyNumber !== undefined ? `#${p.jerseyNumber} ` : ''}
                  {p.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

function PositionPickerSection({
  label,
  selectedAbbr,
  onSelect,
  optional,
}: {
  label: string;
  selectedAbbr: string;
  onSelect: (abbr: string) => void;
  optional?: boolean;
}) {
  const positions = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  return (
    <View className="mb-4">
      <Text className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap gap-2">
        {optional && (
          <TouchableOpacity
            onPress={() => onSelect('')}
            className={`rounded-lg px-3 py-2 border ${
              selectedAbbr === '' ? 'bg-gray-700 border-gray-800' : 'bg-white border-gray-300'
            }`}
          >
            <Text className={`text-sm font-medium ${selectedAbbr === '' ? 'text-white' : 'text-gray-500'}`}>
              keep
            </Text>
          </TouchableOpacity>
        )}
        {positions.map((p) => {
          const selected = p === selectedAbbr;
          return (
            <TouchableOpacity
              key={p}
              onPress={() => onSelect(p)}
              className={`rounded-lg px-3 py-2 border ${
                selected ? 'bg-brand-700 border-brand-500' : 'bg-white border-gray-300'
              }`}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>
                {p}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
