import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '@baseball/ui';
import type { GameEvent } from '@baseball/shared';
import {
  correctionKind,
  FIELDERS,
  PITCH_CHOICES,
  pitchReplacement,
  RESULT_CHOICES,
  resultReplacement,
  scoreReplacement,
  type Replacement,
} from './history-model';

const MAX_RBIS = 4;

interface CorrectionSheetProps {
  /** Null hides the sheet. */
  target: { event: GameEvent; label: string } | null;
  pending: boolean;
  error: string | null;
  onReplace: (event: GameEvent, replacement: Replacement) => void;
  onDelete: (event: GameEvent) => void;
  onClose: () => void;
  /** Opens the web history, for edits the phone doesn't offer. */
  onOpenWeb?: () => void;
}

function ChoiceButton({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`px-3 py-2.5 rounded-lg border border-gray-300 bg-white ${disabled ? 'opacity-40' : ''}`}
      style={{ minWidth: '30%' }}
    >
      <Text className="text-sm font-medium text-gray-900 text-center">{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Corrects one play-by-play event (the web history's edit panel, for the
 * common cases): a new pitch outcome, a new plate-appearance result, a run's
 * RBIs, or delete. Every choice appends to the log; nothing is rewritten.
 */
export function CorrectionSheet({ target, pending, error, onReplace, onDelete, onClose, onOpenWeb }: CorrectionSheetProps) {
  const [chargingError, setChargingError] = useState(false);
  const [rbis, setRbis] = useState(0);

  useEffect(() => {
    setChargingError(false);
    const payloadRbis = (target?.event.payload as Record<string, unknown> | undefined)?.rbis;
    setRbis(typeof payloadRbis === 'number' ? payloadRbis : 0);
  }, [target]);

  if (!target) return <Modal visible={false} />;
  const { event, label } = target;
  const kind = correctionKind(event);

  const confirmDelete = () =>
    Alert.alert('Delete this event?', 'It stays in the log as voided and no longer counts.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(event) },
    ]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-gray-50">
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <TouchableOpacity accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Text className="text-base text-blue-700">Close</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" className="text-base font-semibold text-gray-900">Correct event</Text>
          <View style={{ width: 44 }}>{pending && <ActivityIndicator />}</View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <View className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4">
            <Text className="text-xs text-gray-500">
              Inning {event.inning} · {event.isTopOfInning ? 'Top' : 'Bottom'} · #{event.sequenceNumber}
            </Text>
            <Text className="text-base font-semibold text-gray-900 mt-0.5">{label}</Text>
          </View>

          {kind === 'pitch' && (
            <>
              <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Change the pitch to</Text>
              <View className="flex-row flex-wrap gap-2">
                {PITCH_CHOICES.map((choice) => (
                  <ChoiceButton
                    key={choice.outcome}
                    label={choice.label}
                    disabled={pending}
                    onPress={() => onReplace(event, pitchReplacement(event, choice.outcome))}
                  />
                ))}
              </View>
            </>
          )}

          {kind === 'result' && !chargingError && (
            <>
              <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Change the result to</Text>
              <View className="flex-row flex-wrap gap-2">
                {RESULT_CHOICES.map((choice) => (
                  <ChoiceButton
                    key={choice.value}
                    label={choice.label}
                    disabled={pending}
                    onPress={() =>
                      choice.value === 'error'
                        ? setChargingError(true)
                        : onReplace(event, resultReplacement(event, choice.value))
                    }
                  />
                ))}
              </View>
            </>
          )}

          {kind === 'result' && chargingError && (
            <>
              <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Error charged to</Text>
              <View className="flex-row flex-wrap gap-2">
                {FIELDERS.map((fielder) => (
                  <ChoiceButton
                    key={fielder.number}
                    label={fielder.label}
                    disabled={pending}
                    onPress={() => onReplace(event, resultReplacement(event, 'error', fielder.number))}
                  />
                ))}
              </View>
              <TouchableOpacity accessibilityRole="button" onPress={() => setChargingError(false)} className="mt-3">
                <Text className="text-sm text-blue-700">← Back to results</Text>
              </TouchableOpacity>
            </>
          )}

          {kind === 'score' && (
            <>
              <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">RBIs credited</Text>
              <View className="flex-row items-center gap-3">
                {Array.from({ length: MAX_RBIS + 1 }, (_, n) => (
                  <TouchableOpacity
                    key={n}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: rbis === n }}
                    onPress={() => setRbis(n)}
                    className={`w-11 h-11 rounded-full border items-center justify-center ${
                      rbis === n ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'
                    }`}
                  >
                    <Text className={`text-base font-semibold ${rbis === n ? 'text-white' : 'text-gray-800'}`}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View className="mt-4">
                <Button label="Save RBIs" loading={pending} onPress={() => onReplace(event, scoreReplacement(event, rbis))} />
              </View>
            </>
          )}

          {kind === 'delete' && (
            <Text className="text-sm text-gray-600">
              This event can be deleted here. To change its details, edit it in the web history.
            </Text>
          )}

          {error && <Text accessibilityRole="alert" className="text-sm text-red-700 mt-4">{error}</Text>}

          <View className="mt-6 gap-3">
            <Button label="Delete event" variant="danger" disabled={pending} onPress={confirmDelete} />
            {onOpenWeb && <Button label="Edit on the web" variant="secondary" onPress={onOpenWeb} />}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
