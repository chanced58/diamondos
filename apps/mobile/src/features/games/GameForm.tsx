import { useState } from 'react';
import { ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Button, FormField, SegmentedControl } from '@baseball/ui';
import type { GameFormOptions } from '@baseball/shared';
import { DateTimeFields } from '../forms/DateTimeFields';
import { VenueSearchField } from '../places/VenueSearchField';
import { validateGameForm, type GameFormValues, type OpponentMode } from './game-form-model';

interface GameFormProps {
  initialValues: GameFormValues;
  opponentTeams: GameFormOptions['opponentTeams'];
  /** Create shows "Notify team"; edit doesn't (the web edit form has no announcement). */
  mode: 'create' | 'edit';
  /** The opponent can't go back to TBD once play has started. */
  allowTbd?: boolean;
  submitting: boolean;
  /** A server-side failure to show under the form. */
  submitError: string | null;
  onSubmit: (values: GameFormValues) => void;
}

const LOCATION_OPTIONS = [
  { value: 'home', label: 'Home' },
  { value: 'away', label: 'Away' },
  { value: 'neutral', label: 'Neutral' },
] as const;

const NEUTRAL_HOME_OPTIONS = [
  { value: 'us', label: 'We bat last' },
  { value: 'opponent', label: 'They bat last' },
] as const;

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** The schedule-a-game / edit-game form (the web's AddGameForm and EditGameForm). */
export function GameForm({
  initialValues,
  opponentTeams,
  mode,
  allowTbd = true,
  submitting,
  submitError,
  onSubmit,
}: GameFormProps) {
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (patch: Partial<GameFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const opponentModes = [
    ...(opponentTeams.length > 0 ? [{ value: 'team' as const, label: 'Team' }] : []),
    { value: 'name' as const, label: 'Name' },
    ...(allowTbd ? [{ value: 'tbd' as const, label: 'TBD' }] : []),
  ];

  const submit = () => {
    const problem = validateGameForm(values);
    setValidationError(problem);
    if (!problem) onSubmit(values);
  };

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <FormField label="Opponent" required>
        <SegmentedControl<OpponentMode>
          options={opponentModes}
          value={values.opponentMode}
          onChange={(opponentMode) => set({ opponentMode })}
          testID="opponent-mode"
        />
        <View className="mt-2">
          {values.opponentMode === 'team' && (
            <View className="border border-gray-200 rounded-lg bg-white">
              {opponentTeams.map((team) => {
                const selected = team.id === values.opponentTeamId;
                return (
                  <TouchableOpacity
                    key={team.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => set({ opponentTeamId: team.id, opponentName: team.name })}
                    className="flex-row items-center px-3 py-2.5 border-b border-gray-100"
                  >
                    <Text className="flex-1 text-base text-gray-900">
                      {team.name}
                      {team.city ? <Text className="text-gray-500"> · {team.city}</Text> : null}
                    </Text>
                    {selected && <Text className="text-blue-700 font-bold">✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {values.opponentMode === 'name' && (
            <TextInput
              accessibilityLabel="Opponent name"
              className={inputClass}
              placeholder="e.g. Riverside Eagles"
              placeholderTextColor="#9ca3af"
              value={values.opponentName}
              onChangeText={(opponentName) => set({ opponentName })}
            />
          )}
          {values.opponentMode === 'tbd' && (
            <Text className="text-sm text-gray-500">The opponent will be set later, e.g. once a bracket fills in.</Text>
          )}
        </View>
      </FormField>

      <FormField label="Date and time" required hint="As it reads at the field.">
        <DateTimeFields date={values.date} time={values.time} onChange={(parts) => set(parts)} testID="game-date-time" />
      </FormField>

      <FormField label="Location">
        <SegmentedControl options={LOCATION_OPTIONS} value={values.locationType} onChange={(locationType) => set({ locationType })} />
        {values.locationType === 'neutral' && (
          <View className="mt-2">
            <SegmentedControl options={NEUTRAL_HOME_OPTIONS} value={values.neutralHomeTeam} onChange={(neutralHomeTeam) => set({ neutralHomeTeam })} />
          </View>
        )}
      </FormField>

      <FormField label="Venue / field">
        <VenueSearchField value={values.venue} onChange={(venue) => set({ venue })} />
      </FormField>

      <FormField label="Notes">
        <TextInput
          accessibilityLabel="Notes"
          className={`${inputClass} min-h-[80px]`}
          multiline
          textAlignVertical="top"
          value={values.notes}
          onChangeText={(notes) => set({ notes })}
        />
      </FormField>

      {mode === 'create' && (
        <View className="flex-row items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2.5 mb-4">
          <View className="flex-1 mr-3">
            <Text className="text-base text-gray-900">Notify team</Text>
            <Text className="text-xs text-gray-500">Post the new game to the announcements channel.</Text>
          </View>
          <Switch
            accessibilityLabel="Notify team"
            value={values.notifyTeam}
            disabled={values.opponentMode === 'tbd'}
            onValueChange={(notifyTeam) => set({ notifyTeam })}
          />
        </View>
      )}

      {(validationError ?? submitError) && (
        <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <Text accessibilityRole="alert" className="text-sm text-red-700">{validationError ?? submitError}</Text>
        </View>
      )}

      <Button
        label={mode === 'create' ? 'Schedule game' : 'Save changes'}
        size="lg"
        loading={submitting}
        onPress={submit}
      />
    </ScrollView>
  );
}
