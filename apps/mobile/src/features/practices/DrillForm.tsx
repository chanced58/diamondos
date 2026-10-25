import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Button, FormField } from '@baseball/ui';
import {
  EQUIPMENT_LABELS,
  FIELD_SPACE_LABELS,
  PracticeEquipment,
  PracticeFieldSpace,
  PracticeSkillCategory,
  SKILL_CATEGORY_LABELS,
} from '@baseball/shared';
import { ChoiceChips } from './ChoiceChips';
import { validateDrillForm, type DrillFormValues } from './drill-form-model';
import { useDiscardGuard } from '../forms/use-discard-guard';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';
const multilineClass = `${inputClass} min-h-[96px]`;

interface DrillFormProps {
  initialValues: DrillFormValues;
  submitLabel: string;
  saving: boolean;
  /** The server's refusal, shown under the form. */
  saveError: string | null;
  /** Called with valid values; the screen saves them. */
  onSubmit: (values: DrillFormValues) => void;
  /** Once saved, leaving no longer asks to discard. */
  saved: boolean;
}

/** The new and edit drill form — the web drill form's fields, less the media links. */
export function DrillForm({ initialValues, submitLabel, saving, saveError, onSubmit, saved }: DrillFormProps) {
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (patch: Partial<DrillFormValues>) => setValues((current) => ({ ...current, ...patch }));
  useDiscardGuard(!saved && JSON.stringify(values) !== JSON.stringify(initialValues));

  const submit = () => {
    const problem = validateDrillForm(values);
    setValidationError(problem);
    if (!problem) onSubmit(values);
  };
  const error = validationError ?? saveError;

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <FormField label="Name" required>
          <TextInput accessibilityLabel="Drill name" className={inputClass} value={values.name} onChangeText={(name) => set({ name })} maxLength={120} />
        </FormField>
        <FormField label="Skill categories" required>
          <ChoiceChips
            options={Object.values(PracticeSkillCategory)}
            labels={SKILL_CATEGORY_LABELS}
            selected={values.skillCategories}
            onChange={(skillCategories) => set({ skillCategories })}
          />
        </FormField>
        <FormField label="Description">
          <TextInput accessibilityLabel="Description" className={multilineClass} multiline textAlignVertical="top" value={values.description} onChangeText={(description) => set({ description })} />
        </FormField>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Minutes">
              <TextInput accessibilityLabel="Duration in minutes" className={inputClass} keyboardType="number-pad" value={values.duration} onChangeText={(duration) => set({ duration })} />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Min players">
              <TextInput accessibilityLabel="Min players" className={inputClass} keyboardType="number-pad" value={values.minPlayers} onChangeText={(minPlayers) => set({ minPlayers })} />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Max players">
              <TextInput accessibilityLabel="Max players" className={inputClass} keyboardType="number-pad" value={values.maxPlayers} onChangeText={(maxPlayers) => set({ maxPlayers })} />
            </FormField>
          </View>
        </View>
        <FormField label="Field spaces">
          <ChoiceChips options={Object.values(PracticeFieldSpace)} labels={FIELD_SPACE_LABELS} selected={values.fieldSpaces} onChange={(fieldSpaces) => set({ fieldSpaces })} />
        </FormField>
        <FormField label="Equipment">
          <ChoiceChips options={Object.values(PracticeEquipment)} labels={EQUIPMENT_LABELS} selected={values.equipment} onChange={(equipment) => set({ equipment })} />
        </FormField>
        <FormField label="Coaching points">
          <TextInput accessibilityLabel="Coaching points" className={multilineClass} multiline textAlignVertical="top" value={values.coachingPoints} onChangeText={(coachingPoints) => set({ coachingPoints })} />
        </FormField>
        <FormField label="Tags">
          <TextInput
            accessibilityLabel="Tags"
            className={inputClass}
            value={values.tags}
            onChangeText={(tags) => set({ tags })}
            placeholder="Comma-separated, e.g. timing, two-strike"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
          />
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
