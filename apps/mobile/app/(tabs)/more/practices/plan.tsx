import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { utcToZonedDateTime, type PracticeDrill } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { DateTimeFields } from '../../../../src/features/forms/DateTimeFields';
import { useDiscardGuard } from '../../../../src/features/forms/use-discard-guard';
import { VenueSearchField } from '../../../../src/features/places/VenueSearchField';
import { DrillBrowser } from '../../../../src/features/practices/DrillBrowser';
import { planPractice, useDrills } from '../../../../src/features/practices/drills-api';
import { practicesQueryKey } from '../../../../src/features/practices/practices-api';
import { drillSubtitle } from '../../../../src/features/practices/drill-format';
import { moved, toggled } from '../../../../src/features/practices/drill-form-model';
import {
  emptyPracticeFormValues,
  planPracticeFields,
  validatePlanForm,
  type PracticeFormValues,
} from '../../../../src/features/practices/practice-form-model';
import { deviceTimeZone } from '../../../../src/features/games/game-form-model';
import { describeApiError, isApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * Plan a practice from drills (the web Plan practice page): when and where,
 * the coach's plan (saved as coach-only notes) and drills picked from the
 * library, which become the practice's blocks in the order shown. Coaches only.
 */
export default function PlanPracticeScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const isCoach = activeTeam?.isCoach ?? false;
  const drills = useDrills(isCoach ? teamId : undefined);
  const queryClient = useQueryClient();

  const [values, setValues] = useState(() => emptyPracticeFormValues(utcToZonedDateTime(new Date(), deviceTimeZone())));
  const [plan, setPlan] = useState('');
  const [drillIds, setDrillIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const set = (patch: Partial<PracticeFormValues>) => setValues((current) => ({ ...current, ...patch }));

  const create = useMutation({
    mutationFn: () => planPractice(teamId, planPracticeFields(values, plan, drillIds)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: practicesQueryKey(teamId) }),
  });
  const createdId = create.data?.practiceId;
  useDiscardGuard(!createdId && (plan.trim().length > 0 || drillIds.length > 0), 'Your practice plan has not been saved.');
  // Navigate after the render that drops the discard guard.
  useEffect(() => {
    if (createdId) router.replace({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: createdId } });
  }, [createdId]);

  const drillsById = useMemo(() => new Map((drills.data?.drills ?? []).map((drill) => [drill.id, drill])), [drills.data]);
  const picked = drillIds.map((id) => drillsById.get(id)).filter((drill): drill is PracticeDrill => drill !== undefined);
  const plannedMinutes = picked.reduce((total, drill) => total + (drill.defaultDurationMinutes ?? 10), 0);

  const header = <Stack.Screen options={{ title: 'Plan from drills' }} />;
  if (!isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can plan practices." />
      </View>
    );
  }
  if (drills.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!drills.data) {
    const notOnPlan = isApiError(drills.error) && drills.error.kind === 'forbidden';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {notOnPlan ? (
          <EmptyState title="Practice planning" message="Practice planning is available on the Starter plan and above." />
        ) : (
          <ErrorState message={describeApiError(drills.error)} onRetry={() => void drills.refetch()} />
        )}
      </View>
    );
  }

  const submit = () => {
    const problem = validatePlanForm(teamId, values, plan, drillIds);
    setValidationError(problem);
    if (!problem) create.mutate();
  };
  const error = validationError ?? (create.isError ? describeApiError(create.error) : null);

  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      {header}
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <FormField label="When" required>
          <DateTimeFields date={values.date} time={values.time} onChange={({ date, time }) => set({ date, time })} testID="plan-start" />
        </FormField>
        <FormField label="Duration (minutes)">
          <TextInput
            accessibilityLabel="Duration in minutes"
            className={inputClass}
            keyboardType="number-pad"
            value={values.duration}
            onChangeText={(duration) => set({ duration })}
            placeholder="120"
            placeholderTextColor="#9ca3af"
          />
        </FormField>
        <FormField label="Location">
          <VenueSearchField value={values.venue} onChange={(venue) => set({ venue })} placeholder="e.g. Main field" />
        </FormField>
        <FormField label="Plan (coaches only)">
          <TextInput
            accessibilityLabel="Practice plan"
            className={`${inputClass} min-h-[120px]`}
            multiline
            textAlignVertical="top"
            value={plan}
            onChangeText={setPlan}
            placeholder="Goals, groups, anything the staff should know"
            placeholderTextColor="#9ca3af"
          />
        </FormField>

        <FormField label={picked.length > 0 ? `Drills · ${plannedMinutes} min` : 'Drills'}>
          {picked.map((drill, index) => (
            <PickedDrillRow
              key={drill.id}
              drill={drill}
              position={index}
              last={index === picked.length - 1}
              onMove={(direction) => setDrillIds((ids) => moved(ids, index, direction))}
              onRemove={() => setDrillIds((ids) => ids.filter((id) => id !== drill.id))}
            />
          ))}
          <Button label={picked.length > 0 ? 'Add or remove drills' : 'Pick drills'} variant="secondary" onPress={() => setPicking(true)} />
        </FormField>

        {error && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <Text accessibilityRole="alert" className="text-sm text-red-700">{error}</Text>
          </View>
        )}
        <Button label="Create practice" size="lg" loading={create.isPending} onPress={submit} />
      </ScrollView>

      <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
        <View className="flex-1 bg-gray-50">
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <Text className="text-lg font-semibold text-gray-900">
              {drillIds.length === 1 ? '1 drill picked' : `${drillIds.length} drills picked`}
            </Text>
            <TouchableOpacity accessibilityRole="button" hitSlop={8} onPress={() => setPicking(false)}>
              <Text className="text-base font-semibold text-brand-700">Done</Text>
            </TouchableOpacity>
          </View>
          <DrillBrowser drills={drills.data.drills} pickedIds={drillIds} onPressDrill={(drill) => setDrillIds((ids) => toggled(ids, drill.id))} />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

interface PickedDrillRowProps {
  drill: PracticeDrill;
  position: number;
  last: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

/** A picked drill in practice order, moved up or down or removed. */
function PickedDrillRow({ drill, position, last, onMove, onRemove }: PickedDrillRowProps) {
  return (
    <View className="flex-row items-center bg-white border border-gray-200 rounded-lg px-3 py-2 mb-2">
      <Text className="text-sm font-semibold text-gray-500 w-6">{position + 1}</Text>
      <View className="flex-1 mr-2">
        <Text className="text-base text-gray-900">{drill.name}</Text>
        <Text className="text-xs text-gray-500">{drillSubtitle(drill)}</Text>
      </View>
      <RowAction label="↑" accessibilityLabel={`Move ${drill.name} up`} disabled={position === 0} onPress={() => onMove(-1)} />
      <RowAction label="↓" accessibilityLabel={`Move ${drill.name} down`} disabled={last} onPress={() => onMove(1)} />
      <RowAction label="✕" accessibilityLabel={`Remove ${drill.name}`} onPress={onRemove} />
    </View>
  );
}

/** A small icon button on a picked drill. */
function RowAction({ label, accessibilityLabel, disabled, onPress }: { label: string; accessibilityLabel: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      className={`w-8 h-8 items-center justify-center ${disabled ? 'opacity-30' : ''}`}
    >
      <Text className="text-base text-gray-700">{label}</Text>
    </TouchableOpacity>
  );
}
