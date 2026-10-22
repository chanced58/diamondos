import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button, FormField } from '@baseball/ui';
import { BATS, LINEUP_POSITIONS, POSITION_TO_DB, THROWS, type OpponentRosterPlayer } from '@baseball/shared';
import type { OpponentPlayerFields } from './opponent-lineup-api';
import { positionLabel } from './opponent-lineup-model';

/** What the team-scoped roster also records. */
export interface Handedness {
  bats: (typeof BATS)[number] | null;
  throws: (typeof THROWS)[number] | null;
}

type SheetPlayer = OpponentRosterPlayer & { bats?: string | null; throws?: string | null };

interface OpponentPlayerSheetProps {
  visible: boolean;
  /** Null adds a new player. */
  player: SheetPlayer | null;
  saving: boolean;
  error: string | null;
  /** Also ask for bats and throws (the team's opponent roster; a game's lineup doesn't keep them). */
  withHandedness?: boolean;
  onSave: (fields: OpponentPlayerFields & Partial<Handedness>) => void;
  onClose: () => void;
}

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

const BATS_LABELS: Record<(typeof BATS)[number], string> = { right: 'R', left: 'L', switch: 'S' };

/** Add or edit an opponent roster player: jersey, name, usual position and, when asked, handedness. */
export function OpponentPlayerSheet({ visible, player, saving, error, withHandedness = false, onSave, onClose }: OpponentPlayerSheetProps) {
  const [jersey, setJersey] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState<string | null>(null);
  const [bats, setBats] = useState<Handedness['bats']>(null);
  const [throws, setThrows] = useState<Handedness['throws']>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setJersey(player?.jerseyNumber ?? '');
    setFirstName(player?.firstName ?? '');
    setLastName(player?.lastName ?? '');
    setPosition(player?.primaryPosition ?? null);
    setBats(asHand(BATS, player?.bats));
    setThrows(asHand(THROWS, player?.throws));
    setProblem(null);
  }, [visible, player]);

  const submit = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setProblem('First and last name are required.');
      return;
    }
    setProblem(null);
    onSave({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      jerseyNumber: jersey.trim() || null,
      primaryPosition: (position ?? null) as OpponentPlayerFields['primaryPosition'],
      ...(withHandedness ? { bats, throws } : {}),
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <TouchableOpacity accessibilityRole="button" onPress={onClose} hitSlop={8}>
            <Text className="text-base text-blue-700">Cancel</Text>
          </TouchableOpacity>
          <Text accessibilityRole="header" className="text-base font-semibold text-gray-900">
            {player ? 'Edit player' : 'Add player'}
          </Text>
          <View style={{ width: 52 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <FormField label="Jersey #">
            <TextInput
              accessibilityLabel="Jersey number"
              className={inputClass}
              value={jersey}
              onChangeText={setJersey}
              placeholder="00"
              placeholderTextColor="#9ca3af"
              maxLength={4}
              keyboardType="number-pad"
            />
          </FormField>
          <FormField label="First name" required>
            <TextInput
              accessibilityLabel="First name"
              className={inputClass}
              value={firstName}
              onChangeText={setFirstName}
              placeholder="First"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />
          </FormField>
          <FormField label="Last name" required>
            <TextInput
              accessibilityLabel="Last name"
              className={inputClass}
              value={lastName}
              onChangeText={setLastName}
              placeholder="Last"
              placeholderTextColor="#9ca3af"
              autoCapitalize="words"
            />
          </FormField>
          <FormField label="Position">
            <View className="flex-row flex-wrap gap-2">
              {[null, ...LINEUP_POSITIONS.map((abbr) => POSITION_TO_DB[abbr])].map((value) => {
                const selected = value === position;
                return (
                  <TouchableOpacity
                    key={value ?? 'none'}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setPosition(value)}
                    className={`px-3 py-1.5 rounded-full border ${selected ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}
                  >
                    <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>
                      {positionLabel(value) ?? '—'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormField>
          {withHandedness && (
            <>
              <FormField label="Bats">
                <ChoiceRow
                  label="Bats"
                  options={BATS.map((value) => ({ value, label: BATS_LABELS[value] }))}
                  value={bats}
                  onChange={setBats}
                />
              </FormField>
              <FormField label="Throws">
                <ChoiceRow
                  label="Throws"
                  options={THROWS.map((value) => ({ value, label: BATS_LABELS[value] }))}
                  value={throws}
                  onChange={setThrows}
                />
              </FormField>
            </>
          )}

          {(problem ?? error) && (
            <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">{problem ?? error}</Text>
          )}
          <Button label={player ? 'Save player' : 'Add player'} size="lg" loading={saving} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function asHand<T extends string>(allowed: readonly T[], value: string | null | undefined): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** "—" plus each choice as a pill; the selected one is filled. */
function ChoiceRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {[{ value: null, label: '—' }, ...options].map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value ?? 'none'}
            accessibilityRole="radio"
            accessibilityLabel={`${label} ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className={`px-4 py-1.5 rounded-full border ${selected ? 'bg-blue-700 border-blue-700' : 'bg-white border-gray-300'}`}
          >
            <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
