import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { PitchOutcome, PitchType } from '@baseball/shared';

interface PitchInputProps {
  onRecordPitch: (outcome: PitchOutcome, pitchType?: PitchType) => void;
  onRecordHit: () => void;
  onRecordOut: () => void;
  onRecordWalk: () => void;
  onRecordStrikeout: () => void;
}

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
}: PitchInputProps) {
  return (
    <ScrollView className="flex-1 bg-gray-50">
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
        </View>
      </View>

      {/* Plate appearance outcomes */}
      <View className="px-4 pt-5">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Plate appearance result
        </Text>
        <View className="flex-row flex-wrap gap-2">
          <OutcomeButton label="Hit" emoji="⚾" onPress={onRecordHit} color="bg-blue-600" />
          <OutcomeButton label="Out" emoji="✋" onPress={onRecordOut} color="bg-gray-600" />
          <OutcomeButton label="Walk (BB)" emoji="🚶" onPress={onRecordWalk} color="bg-green-600" />
          <OutcomeButton label="Strikeout" emoji="K" onPress={onRecordStrikeout} color="bg-red-600" />
        </View>
      </View>
    </ScrollView>
  );
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
