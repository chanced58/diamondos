import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import {
  FIELDING_POSITION_NUMBERS,
  MAX_FIELDING_SEQUENCE,
  appendThrow,
  undoThrow,
} from '@baseball/shared';

/**
 * The throw step after an out: the fielder who first touched the ball is
 * already in the sequence, and the scorer taps where it was thrown (6 → 4 → 3).
 * A caught fly is just Done. fielding-stats credits the last position with the
 * putout and the rest with assists, which is why this exists at all.
 *
 * Also the putout-order step for a runner thrown out on a play, where the
 * first fielder is only a guess from the batted ball (or absent): that
 * caller passes its own title and `lockFirstFielder={false}` so Undo can
 * clear it.
 */
export function ThrowSequenceModal({
  visible,
  firstFielder,
  title = 'Where was it thrown?',
  subtitle = 'Tap each fielder in order. Caught on the fly? Just tap Done.',
  lockFirstFielder = true,
  onDone,
}: {
  visible: boolean;
  firstFielder: number | null;
  title?: string;
  subtitle?: string;
  /** When true (the batted-out throw step), Undo never removes the first fielder. */
  lockFirstFielder?: boolean;
  onDone: (sequence: number[]) => void;
}) {
  const [sequence, setSequence] = useState<number[]>(firstFielder !== null ? [firstFielder] : []);

  useEffect(() => {
    if (visible) setSequence(firstFielder !== null ? [firstFielder] : []);
  }, [visible, firstFielder]);

  const full = sequence.length >= MAX_FIELDING_SEQUENCE;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={() => onDone(sequence)}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
          <Text className="text-lg font-bold text-gray-900 mb-1">{title}</Text>
          <Text className="text-sm text-gray-500 mb-3">{subtitle}</Text>
          <Text testID="throw-sequence-readout" className="text-2xl font-bold text-slate-900 mb-4">
            {sequence.join(' → ')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FIELDING_POSITION_NUMBERS.map(({ number, abbr }) => (
              <TouchableOpacity
                key={number}
                testID={`throw-position-${number}`}
                disabled={full}
                className={`border rounded-xl px-4 py-3 ${full ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'}`}
                onPress={() => setSequence((current) => appendThrow(current, number))}
              >
                <Text className="text-slate-800 font-semibold">
                  {number} {abbr}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View className="flex-row gap-2 mt-4">
            <TouchableOpacity
              testID="throw-undo"
              className="flex-1 py-3 rounded-xl border border-slate-300 items-center"
              onPress={() =>
                setSequence((current) => (lockFirstFielder ? undoThrow(current) : current.slice(0, -1)))
              }
            >
              <Text className="text-slate-700 font-semibold">Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="throw-done"
              className="flex-1 py-3 rounded-xl bg-slate-800 items-center"
              onPress={() => onDone(sequence)}
            >
              <Text className="text-white font-semibold">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
