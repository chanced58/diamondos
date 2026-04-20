import { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { AdvanceReason } from '@baseball/shared';
import type { LiveGameState } from '@baseball/shared';

type Base = 1 | 2 | 3;

interface RosterPlayer {
  id: string;
  name: string;
  jerseyNumber?: number;
}

interface BaserunnerDisplayProps {
  gameState: LiveGameState;
  onRecordStolenBase?: (fromBase: Base, runnerId: string) => void;
  onRecordCaughtStealing?: (fromBase: Base, runnerId: string) => void;
  onRecordAdvance?: (fromBase: Base, runnerId: string, reason: AdvanceReason) => void;
  onRecordPickoffOut?: (fromBase: Base, runnerId: string) => void;
  onRecordPinchRunner?: (fromBase: Base, outRunnerId: string, inRunnerId: string) => void;
  roster?: RosterPlayer[];
}

const DIAMOND_SIZE = 100;

/**
 * Renders a baseball diamond with filled bases for occupied runners.
 * Tapping an occupied base opens an action modal for baserunning events
 * (stolen base, caught stealing, advance on wild pitch / passed ball).
 */
export function BaserunnerDisplay({
  gameState,
  onRecordStolenBase,
  onRecordCaughtStealing,
  onRecordAdvance,
  onRecordPickoffOut,
  onRecordPinchRunner,
  roster,
}: BaserunnerDisplayProps) {
  const { first, second, third } = gameState.runnersOnBase;
  const [selected, setSelected] = useState<{ base: Base; runnerId: string } | null>(null);
  const [pinchRunnerPicker, setPinchRunnerPicker] = useState<{ base: Base; runnerId: string } | null>(null);

  const interactive = !!(onRecordStolenBase || onRecordCaughtStealing || onRecordAdvance || onRecordPickoffOut || onRecordPinchRunner);

  function handleBaseTap(base: Base, runnerId: string | null) {
    if (!interactive || !runnerId) return;
    setSelected({ base, runnerId });
  }

  function close() {
    setSelected(null);
  }

  function handleSteal() {
    if (!selected) return;
    onRecordStolenBase?.(selected.base, selected.runnerId);
    close();
  }

  function handleCaughtStealing() {
    if (!selected) return;
    onRecordCaughtStealing?.(selected.base, selected.runnerId);
    close();
  }

  function handleAdvance(reason: AdvanceReason) {
    if (!selected) return;
    onRecordAdvance?.(selected.base, selected.runnerId, reason);
    close();
  }

  function handlePickoffOut() {
    if (!selected) return;
    onRecordPickoffOut?.(selected.base, selected.runnerId);
    close();
  }

  function handlePinchRunnerStart() {
    if (!selected) return;
    setPinchRunnerPicker({ base: selected.base, runnerId: selected.runnerId });
    close();
  }

  function handlePinchRunnerPick(inRunnerId: string) {
    if (!pinchRunnerPicker) return;
    onRecordPinchRunner?.(pinchRunnerPicker.base, pinchRunnerPicker.runnerId, inRunnerId);
    setPinchRunnerPicker(null);
  }

  return (
    <View
      className="items-center justify-center"
      style={{ width: DIAMOND_SIZE, height: DIAMOND_SIZE }}
    >
      <View className="relative" style={{ width: 80, height: 80 }}>
        <BaseTap
          base={2}
          runnerId={second}
          style={{ top: 0, left: 30 }}
          onPress={handleBaseTap}
          interactive={interactive}
        />
        <BaseTap
          base={3}
          runnerId={third}
          style={{ top: 30, left: 0 }}
          onPress={handleBaseTap}
          interactive={interactive}
        />
        <BaseTap
          base={1}
          runnerId={first}
          style={{ top: 30, left: 60 }}
          onPress={handleBaseTap}
          interactive={interactive}
        />
        {/* Home plate — bottom center (indicator only) */}
        <View
          className="absolute w-4 h-4 bg-gray-300 rotate-45"
          style={{ bottom: 0, left: 32 }}
        />
      </View>

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5">
            <Text className="text-lg font-bold text-gray-900 mb-1">
              Runner on {selected ? baseLabel(selected.base) : ''}
            </Text>
            <Text className="text-sm text-gray-500 mb-4">
              What just happened to this runner?
            </Text>

            <View className="gap-3">
              <RunnerActionButton
                label="Stolen Base"
                sub={selected ? `Advances to ${baseLabel((selected.base + 1) as 2 | 3 | 4)}` : ''}
                color="bg-blue-600"
                onPress={handleSteal}
              />
              <RunnerActionButton
                label="Caught Stealing"
                sub="Runner is out"
                color="bg-red-600"
                onPress={handleCaughtStealing}
              />
              <RunnerActionButton
                label="Advance on Wild Pitch"
                sub={selected ? `Advances to ${baseLabel((selected.base + 1) as 2 | 3 | 4)}` : ''}
                color="bg-amber-600"
                onPress={() => handleAdvance(AdvanceReason.WILD_PITCH)}
              />
              <RunnerActionButton
                label="Advance on Passed Ball"
                sub={selected ? `Advances to ${baseLabel((selected.base + 1) as 2 | 3 | 4)}` : ''}
                color="bg-yellow-600"
                onPress={() => handleAdvance(AdvanceReason.PASSED_BALL)}
              />
              <RunnerActionButton
                label="Picked Off"
                sub="Runner is out on pickoff throw"
                color="bg-gray-700"
                onPress={handlePickoffOut}
              />
              {onRecordPinchRunner && roster && roster.length > 0 && (
                <RunnerActionButton
                  label="Pinch Runner"
                  sub="Replace this runner with a new player"
                  color="bg-sky-700"
                  onPress={handlePinchRunnerStart}
                />
              )}
            </View>

            <TouchableOpacity className="mt-4 py-3 items-center" onPress={close}>
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pinch runner: pick incoming player from roster */}
      <Modal
        visible={!!pinchRunnerPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setPinchRunnerPicker(null)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-2xl px-5 pb-8 pt-5" style={{ maxHeight: '75%' }}>
            <Text className="text-lg font-bold text-gray-900 mb-1">Pinch Runner</Text>
            <Text className="text-sm text-gray-500 mb-4">
              Select the new runner for {pinchRunnerPicker ? baseLabel(pinchRunnerPicker.base) : ''}.
            </Text>
            {roster && roster.length > 0 ? (
              <ScrollView className="max-h-96">
                <View className="gap-2">
                  {roster.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      className="bg-sky-700 rounded-xl px-4 py-3"
                      onPress={() => handlePinchRunnerPick(p.id)}
                    >
                      <Text className="text-white font-semibold text-base">
                        {p.jerseyNumber !== undefined ? `#${p.jerseyNumber} ` : ''}
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            ) : (
              <Text className="text-gray-500 text-sm py-4">No players loaded.</Text>
            )}
            <TouchableOpacity className="mt-4 py-3 items-center" onPress={() => setPinchRunnerPicker(null)}>
              <Text className="text-gray-500 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function baseLabel(base: 1 | 2 | 3 | 4): string {
  switch (base) {
    case 1: return '1st';
    case 2: return '2nd';
    case 3: return '3rd';
    case 4: return 'home';
  }
}

function BaseTap({
  base,
  runnerId,
  style,
  onPress,
  interactive,
}: {
  base: Base;
  runnerId: string | null;
  style: object;
  onPress: (base: Base, runnerId: string | null) => void;
  interactive: boolean;
}) {
  const occupied = !!runnerId;
  const fill = occupied
    ? 'bg-yellow-400 border-2 border-yellow-500'
    : 'bg-gray-200 border-2 border-gray-300';

  if (!interactive || !occupied) {
    return (
      <View
        className={`absolute w-5 h-5 rotate-45 ${fill}`}
        style={style}
      />
    );
  }

  return (
    <TouchableOpacity
      className={`absolute w-5 h-5 rotate-45 ${fill}`}
      style={style}
      onPress={() => onPress(base, runnerId)}
    />
  );
}

function RunnerActionButton({
  label,
  sub,
  color,
  onPress,
}: {
  label: string;
  sub: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity className={`${color} rounded-xl px-5 py-4`} onPress={onPress}>
      <Text className="text-white font-semibold">{label}</Text>
      {sub ? <Text className="text-white/70 text-xs mt-0.5">{sub}</Text> : null}
    </TouchableOpacity>
  );
}
