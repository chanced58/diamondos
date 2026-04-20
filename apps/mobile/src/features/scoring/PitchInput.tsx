import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { HitType, PitchOutcome, PitchType } from '@baseball/shared';
import type { DroppedThirdStrikeOutcome } from '@baseball/shared';

interface DroppedThirdStrikeDetails {
  outcome: DroppedThirdStrikeOutcome;
  fieldingSequence?: number[];
  errorBy?: number;
  isWildPitch?: boolean;
}

type Base = 1 | 2 | 3;

export type BattedOutType = 'groundout' | 'flyout' | 'lineout' | 'popout' | 'other';

interface PitchInputProps {
  onRecordPitch: (outcome: PitchOutcome, pitchType?: PitchType) => void;
  onRecordHit: (hitType: HitType) => void;
  onRecordOut: (outType: BattedOutType) => void;
  onRecordWalk: () => void;
  onRecordStrikeout: () => void;
  onRecordError: () => void;
  onRecordSacFly: () => void;
  onRecordSacBunt: () => void;
  onRecordFieldersChoice: (runnerId: string, fromBase: Base) => void;
  onRecordWildPitch: () => void;
  onRecordPassedBall: () => void;
  onRecordBalk: () => void;
  onRecordDoublePlay: () => void;
  onRecordTriplePlay: () => void;
  onUndoLastEvent: () => void;
  runnersOnBase: { base: Base; runnerId: string }[];
  onRecordDroppedThirdStrike?: (details: DroppedThirdStrikeDetails) => void;
  droppedThirdStrikeEligible?: boolean;
}

const HIT_TYPES: Array<{ label: string; emoji: string; hitType: HitType; color: string }> = [
  { label: '1B', emoji: '⚾', hitType: HitType.SINGLE, color: 'bg-blue-600' },
  { label: '2B', emoji: '⚾⚾', hitType: HitType.DOUBLE, color: 'bg-indigo-600' },
  { label: '3B', emoji: '⚾⚾⚾', hitType: HitType.TRIPLE, color: 'bg-purple-600' },
  { label: 'HR', emoji: '💥', hitType: HitType.HOME_RUN, color: 'bg-amber-600' },
];

const PITCH_OUTCOMES: Array<{ label: string; outcome: PitchOutcome; color: string }> = [
  { label: 'Called ⚾', outcome: PitchOutcome.CALLED_STRIKE, color: 'bg-red-100 border-red-300 text-red-700' },
  { label: 'Swing K', outcome: PitchOutcome.SWINGING_STRIKE, color: 'bg-red-100 border-red-300 text-red-700' },
  { label: 'Ball', outcome: PitchOutcome.BALL, color: 'bg-green-100 border-green-300 text-green-700' },
  { label: 'Foul', outcome: PitchOutcome.FOUL, color: 'bg-yellow-100 border-yellow-300 text-yellow-700' },
  { label: 'HBP', outcome: PitchOutcome.HIT_BY_PITCH, color: 'bg-orange-100 border-orange-300 text-orange-700' },
];

const PLATE_OUTCOMES: Array<{ label: string; onPress: () => void; color: string }> = [];

/**
 * Primary pitch and plate-appearance input interface.
 * Records individual pitches (ball/strike/foul) and plate outcomes (hit/out/walk/K).
 */
export function PitchInput({
  onRecordPitch,
  onRecordHit,
  onRecordOut,
  onRecordWalk,
  onRecordStrikeout,
  onRecordError,
  onRecordSacFly,
  onRecordSacBunt,
  onRecordFieldersChoice,
  onRecordWildPitch,
  onRecordPassedBall,
  onRecordBalk,
  onRecordDoublePlay,
  onRecordTriplePlay,
  onUndoLastEvent,
  runnersOnBase,
  onRecordDroppedThirdStrike,
  droppedThirdStrikeEligible = false,
}: PitchInputProps) {
  const [showD3KModal, setShowD3KModal] = useState(false);
  const [showFCModal, setShowFCModal] = useState(false);
  const [showOutModal, setShowOutModal] = useState(false);
  const fcEligible = runnersOnBase.length > 0;

  function handleFCPick(runnerId: string, fromBase: Base) {
    setShowFCModal(false);
    onRecordFieldersChoice(runnerId, fromBase);
  }

  function handleOutPick(outType: BattedOutType) {
    setShowOutModal(false);
    onRecordOut(outType);
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

      {/* Pitch-by-pitch section */}
      <View className="px-4 pt-4">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Record pitch
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {PITCH_OUTCOMES.map(({ label, outcome, color }) => (
            <TouchableOpacity
              key={outcome}
              className={`border rounded-xl px-4 py-3 ${color}`}
              onPress={() => onRecordPitch(outcome)}
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
          {HIT_TYPES.map(({ label, emoji, hitType, color }) => (
            <OutcomeButton
              key={hitType}
              label={label}
              emoji={emoji}
              onPress={() => onRecordHit(hitType)}
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
          <OutcomeButton label="Out" emoji="✋" onPress={() => setShowOutModal(true)} color="bg-gray-600" />
          <OutcomeButton label="Walk (BB)" emoji="🚶" onPress={onRecordWalk} color="bg-green-600" />
          <OutcomeButton label="Strikeout" emoji="K" onPress={onRecordStrikeout} color="bg-red-600" />
          <OutcomeButton label="Error" emoji="E" onPress={onRecordError} color="bg-orange-600" />
          <OutcomeButton label="Sac Fly" emoji="SF" onPress={onRecordSacFly} color="bg-teal-600" />
          <OutcomeButton label="Sac Bunt" emoji="SH" onPress={onRecordSacBunt} color="bg-teal-700" />
          {fcEligible && (
            <OutcomeButton
              label="Fielder's Choice"
              emoji="FC"
              onPress={() => setShowFCModal(true)}
              color="bg-purple-700"
            />
          )}
          <OutcomeButton label="Balk" emoji="BK" onPress={onRecordBalk} color="bg-pink-600" />
          <OutcomeButton label="Double Play" emoji="DP" onPress={onRecordDoublePlay} color="bg-zinc-700" />
          <OutcomeButton label="Triple Play" emoji="TP" onPress={onRecordTriplePlay} color="bg-zinc-800" />
          {droppedThirdStrikeEligible && onRecordDroppedThirdStrike && (
            <OutcomeButton
              label="Dropped 3rd K"
              emoji="K!"
              onPress={() => setShowD3KModal(true)}
              color="bg-amber-600"
            />
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
              Dropped Third Strike
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              What happened after the dropped third strike?
            </Text>

            <View className="gap-3">
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

      {/* Out type picker: scorer picks the trajectory of the batted-ball out */}
      <Modal
        visible={showOutModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOutModal(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
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

            <TouchableOpacity className="mt-4 py-3 items-center" onPress={() => setShowOutModal(false)}>
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
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
                  className="bg-purple-700 rounded-xl px-5 py-4"
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

function OutcomeButton({
  label,
  emoji,
  onPress,
  color,
}: {
  label: string;
  emoji: string;
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity
      className={`${color} rounded-xl px-5 py-3.5 flex-row items-center gap-2`}
      onPress={onPress}
    >
      <Text className="text-white text-base">{emoji}</Text>
      <Text className="text-white font-semibold">{label}</Text>
    </TouchableOpacity>
  );
}
