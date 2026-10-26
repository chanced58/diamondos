import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, FormField } from '@baseball/ui';
import type { RosterPlayerFields } from '@baseball/shared';
import { ChoiceChips } from '../practices/ChoiceChips';
import { useDiscardGuard } from '../forms/use-discard-guard';
import {
  HAND_LABELS,
  HAND_OPTIONS,
  POSITION_LABELS,
  POSITION_OPTIONS,
  POSITION_SHORT_LABELS,
  toPlayerFields,
  type PlayerFormValues,
} from './player-form-model';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** One choice from a chip row: tapping another picks it, tapping the chosen one clears it. */
function pickOne<T extends string>(current: T | null, picked: T[]): T | null {
  return picked.find((value) => value !== current) ?? null;
}

interface PlayerFormProps {
  initialValues: PlayerFormValues;
  submitLabel: string;
  saving: boolean;
  /** The server's refusal, shown under the form. */
  saveError: string | null;
  /** Shown under the email field (a new player's invite). */
  emailHint?: string;
  /** Called with valid fields; the screen saves them. */
  onSubmit: (fields: RosterPlayerFields) => void;
  /** Once saved, leaving no longer asks to discard. */
  saved: boolean;
}

/** The add and edit player form — the web roster form's fields. */
export function PlayerForm({ initialValues, submitLabel, saving, saveError, emailHint, onSubmit, saved }: PlayerFormProps) {
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (patch: Partial<PlayerFormValues>) => setValues((current) => ({ ...current, ...patch }));

  useDiscardGuard(!saved && JSON.stringify(values) !== JSON.stringify(initialValues));

  const submit = () => {
    const result = toPlayerFields(values);
    if ('error' in result) {
      setValidationError(result.error);
      return;
    }
    setValidationError(null);
    onSubmit(result.fields);
  };

  const error = validationError ?? saveError;
  const secondaryOptions = POSITION_OPTIONS.filter((p) => p !== values.primaryPosition);
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="First name" required>
              <TextInput accessibilityLabel="First name" className={inputClass} value={values.firstName} onChangeText={(firstName) => set({ firstName })} maxLength={50} autoComplete="off" />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Last name" required>
              <TextInput accessibilityLabel="Last name" className={inputClass} value={values.lastName} onChangeText={(lastName) => set({ lastName })} maxLength={50} autoComplete="off" />
            </FormField>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Jersey #">
              <TextInput accessibilityLabel="Jersey number" className={inputClass} keyboardType="number-pad" value={values.jerseyNumber} onChangeText={(jerseyNumber) => set({ jerseyNumber })} maxLength={2} />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Graduation year">
              <TextInput accessibilityLabel="Graduation year" className={inputClass} keyboardType="number-pad" value={values.graduationYear} onChangeText={(graduationYear) => set({ graduationYear })} maxLength={4} />
            </FormField>
          </View>
        </View>

        <FormField label="Primary position">
          <ChoiceChips
            options={POSITION_OPTIONS}
            labels={POSITION_SHORT_LABELS}
            selected={values.primaryPosition ? [values.primaryPosition] : []}
            onChange={(picked) => set({ primaryPosition: pickOne(values.primaryPosition, picked) })}
          />
          {values.primaryPosition && <Text className="text-xs text-gray-500 mt-1">{POSITION_LABELS[values.primaryPosition]}</Text>}
        </FormField>

        <FormField label="Secondary positions">
          <ChoiceChips
            options={secondaryOptions}
            labels={POSITION_SHORT_LABELS}
            selected={values.secondaryPositions.filter((p) => p !== values.primaryPosition)}
            onChange={(secondaryPositions) => set({ secondaryPositions })}
          />
        </FormField>

        <FormField label="Bats">
          <ChoiceChips options={HAND_OPTIONS} labels={HAND_LABELS} selected={values.bats ? [values.bats] : []} onChange={(picked) => set({ bats: pickOne(values.bats, picked) })} />
        </FormField>
        <FormField label="Throws">
          <ChoiceChips options={HAND_OPTIONS} labels={HAND_LABELS} selected={values.throws ? [values.throws] : []} onChange={(picked) => set({ throws: pickOne(values.throws, picked) })} />
        </FormField>

        <FormField label="Email" hint={emailHint}>
          <TextInput
            accessibilityLabel="Email"
            className={inputClass}
            value={values.email}
            onChangeText={(email) => set({ email })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
        </FormField>
        <FormField label="Phone">
          <TextInput accessibilityLabel="Phone" className={inputClass} value={values.phone} onChangeText={(phone) => set({ phone })} keyboardType="phone-pad" maxLength={30} autoComplete="off" />
        </FormField>

        {error && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <Text accessibilityRole="alert" className="text-sm text-red-700">{error}</Text>
          </View>
        )}
        <Button label={submitLabel} size="lg" loading={saving} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
