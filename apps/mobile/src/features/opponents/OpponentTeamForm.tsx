import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput } from 'react-native';
import { Button, FormField } from '@baseball/ui';
import type { OpponentTeamFields } from './opponent-teams-api';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

interface OpponentTeamFormProps {
  initial?: Partial<Record<keyof OpponentTeamFields, string | null>>;
  submitLabel: string;
  saving: boolean;
  error: string | null;
  onSubmit: (fields: OpponentTeamFields) => void;
}

/** An opponent team's name and details (the web New Opponent and roster-page forms). */
export function OpponentTeamForm({ initial, submitLabel, saving, error, onSubmit }: OpponentTeamFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [abbreviation, setAbbreviation] = useState(initial?.abbreviation ?? '');
  const [city, setCity] = useState(initial?.city ?? '');
  const [stateCode, setStateCode] = useState(initial?.stateCode ?? '');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) {
      setProblem('Team name is required.');
      return;
    }
    setProblem(null);
    onSubmit({
      name: name.trim(),
      abbreviation: abbreviation.trim() || null,
      city: city.trim() || null,
      stateCode: stateCode.trim().toUpperCase() || null,
    });
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <FormField label="Team name" required>
          <TextInput
            accessibilityLabel="Team name"
            className={inputClass}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Eagles"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            maxLength={100}
          />
        </FormField>
        <FormField label="Abbreviation">
          <TextInput
            accessibilityLabel="Abbreviation"
            className={inputClass}
            value={abbreviation}
            onChangeText={setAbbreviation}
            placeholder="EAG"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            maxLength={10}
          />
        </FormField>
        <FormField label="City">
          <TextInput
            accessibilityLabel="City"
            className={inputClass}
            value={city}
            onChangeText={setCity}
            placeholder="City"
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
            maxLength={80}
          />
        </FormField>
        <FormField label="State">
          <TextInput
            accessibilityLabel="State"
            className={inputClass}
            value={stateCode}
            onChangeText={setStateCode}
            placeholder="ID"
            placeholderTextColor="#9ca3af"
            autoCapitalize="characters"
            maxLength={2}
          />
        </FormField>

        {(problem ?? error) && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">{problem ?? error}</Text>
        )}
        <Button label={submitLabel} size="lg" loading={saving} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
