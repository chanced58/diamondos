import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { nearestFielder, type BattedBall } from '@baseball/shared';
import { FieldDiagram } from './FieldDiagram';

/**
 * The pop-up shown on In play when the game tracks hit location. One tap is
 * the common case: it places the ball and selects the nearest fielder. The
 * scorer can pick another fielder, clear it (over the wall), or Skip a play
 * they didn't see — Skip records nothing.
 */
export function FieldLocationModal({
  visible,
  onNext,
  onSkip,
}: {
  visible: boolean;
  onNext: (battedBall: BattedBall) => void;
  onSkip: () => void;
}) {
  const [location, setLocation] = useState<{ sprayX: number; sprayY: number } | null>(null);
  const [fielder, setFielder] = useState<number | null>(null);

  useEffect(() => {
    if (visible) {
      setLocation(null);
      setFielder(null);
    }
  }, [visible]);

  function placeBall(point: { sprayX: number; sprayY: number }) {
    setLocation(point);
    setFielder(nearestFielder(point.sprayX, point.sprayY));
  }

  function pressFielder(position: number) {
    setFielder((current) => (current === position ? null : position));
  }

  function next() {
    if (!location) return;
    onNext({ ...location, firstFielder: fielder });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={onSkip}
    >
      <View className="flex-1 items-center justify-center bg-black/50 px-4">
        <View className="bg-white rounded-2xl p-4 w-full" style={{ maxWidth: 560 }}>
          <Text className="text-lg font-bold text-gray-900">Where did it go?</Text>
          <Text className="text-sm text-gray-500 mb-3">
            {location
              ? 'Tap a fielder to change who touched it first.'
              : 'Tap where the ball landed or was fielded.'}
          </Text>
          <FieldDiagram
            location={location}
            selectedFielder={fielder}
            onPlaceBall={placeBall}
            onPressFielder={pressFielder}
          />
          <View className="flex-row gap-2 mt-3">
            <TouchableOpacity
              className="flex-1 py-3 rounded-xl border border-slate-300 items-center"
              onPress={onSkip}
            >
              <Text className="text-slate-700 font-semibold">Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`flex-1 py-3 rounded-xl items-center ${location ? 'bg-slate-800' : 'bg-slate-300'}`}
              disabled={!location}
              onPress={next}
            >
              <Text className="text-white font-semibold">Next</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
