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
 * clear it. An unlocked guess the scorer never touches counts as nothing
 * entered — Done alone must not credit that fielder with a putout.
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
  /** When true (the batted-out throw step), Undo never removes the first
   *  fielder. When false, the first fielder is a suggestion: returned only
   *  once the scorer taps a fielder or Undo. */
  lockFirstFielder?: boolean;
  onDone: (sequence: number[]) => void;
}) {
  const [sequence, setSequence] = useState<number[]>(firstFielder !== null ? [firstFielder] : []);
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSequence(firstFielder !== null ? [firstFielder] : []);
    setEdited(false);
  }, [visible, firstFielder]);

  const full = sequence.length >= MAX_FIELDING_SEQUENCE;
  const isUnconfirmedGuess = !lockFirstFielder && !edited;
  /** Done / close: an untouched unlocked guess is returned as nothing entered. */
  const finish = () => onDone(isUnconfirmedGuess ? [] : sequence);

  /** Any tap or Undo — marks the sequence as the scorer's own. */
  function edit(change: (current: number[]) => number[]) {
    setEdited(true);
    setSequence(change);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={finish}
    >
      <View className="flex-1 justify-end bg-black/50">
        <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
          <Text className="text-lg font-bold text-gray-900 mb-1">{title}</Text>
          <Text className="text-sm text-gray-500 mb-3">{subtitle}</Text>
          <Text
            testID="throw-sequence-readout"
            className={`text-2xl font-bold mb-4 ${isUnconfirmedGuess ? 'text-slate-400' : 'text-slate-900'}`}
          >
            {sequence.join(' → ')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {FIELDING_POSITION_NUMBERS.map(({ number, abbr }) => (
              <TouchableOpacity
                key={number}
                testID={`throw-position-${number}`}
                disabled={full}
                className={`border rounded-xl px-4 py-3 ${full ? 'border-slate-200 bg-slate-100' : 'border-slate-300 bg-white'}`}
                onPress={() => edit((current) => appendThrow(current, number))}
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
              onPress={() => edit((current) => (lockFirstFielder ? undoThrow(current) : current.slice(0, -1)))}
            >
              <Text className="text-slate-700 font-semibold">Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="throw-done"
              className="flex-1 py-3 rounded-xl bg-slate-800 items-center"
              onPress={finish}
            >
              <Text className="text-white font-semibold">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
