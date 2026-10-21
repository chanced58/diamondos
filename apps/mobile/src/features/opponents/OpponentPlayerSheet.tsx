import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button, FormField } from '@baseball/ui';
import { LINEUP_POSITIONS, POSITION_TO_DB, type OpponentRosterPlayer } from '@baseball/shared';
import type { OpponentPlayerFields } from './opponent-lineup-api';
import { positionLabel } from './opponent-lineup-model';

interface OpponentPlayerSheetProps {
  visible: boolean;
  /** Null adds a new player. */
  player: OpponentRosterPlayer | null;
  saving: boolean;
  error: string | null;
  onSave: (fields: OpponentPlayerFields) => void;
  onClose: () => void;
}

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** Add or edit an opponent roster player: jersey, name and usual position. */
export function OpponentPlayerSheet({ visible, player, saving, error, onSave, onClose }: OpponentPlayerSheetProps) {
  const [jersey, setJersey] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setJersey(player?.jerseyNumber ?? '');
    setFirstName(player?.firstName ?? '');
    setLastName(player?.lastName ?? '');
    setPosition(player?.primaryPosition ?? null);
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

          {(problem ?? error) && (
            <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">{problem ?? error}</Text>
          )}
          <Button label={player ? 'Save player' : 'Add player'} size="lg" loading={saving} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
