import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, FormField } from '@baseball/ui';
import {
  DEFAULT_AI_FIELD_SPACES,
  FIELD_SPACE_LABELS,
  PracticeFieldSpace,
  type AiPracticePreviewInput,
  type AiPracticePreviewResponse,
} from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { DateTimeFields } from '../../../../src/features/forms/DateTimeFields';
import { localDateFromParts } from '../../../../src/features/forms/date-parts';
import { createAiPractice, previewAiPractice } from '../../../../src/features/practices/planning-api';
import { practicesQueryKey } from '../../../../src/features/practices/practices-api';
import { PlanBlocksList, plannedMinutes } from '../../../../src/features/practices/PlanBlocksList';
import { aiPreviewRequest, defaultAiStart, type AiFormValues } from '../../../../src/features/practices/planning-model';
import { describeApiError } from '../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/**
 * Generate a practice with AI (the web /practices/new/ai): describe the
 * practice, Claude drafts it from the team's drill library, then the coach
 * picks a time and saves it. Coaches only.
 */
export default function AiPracticeScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const queryClient = useQueryClient();
  const [values, setValues] = useState<AiFormValues>({ prompt: '', duration: '90', players: '14', fieldSpaces: DEFAULT_AI_FIELD_SPACES });
  const [start, setStart] = useState(() => defaultAiStart());
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ result: AiPracticePreviewResponse; durationMinutes: number } | null>(null);

  const generate = useMutation({
    mutationFn: (fields: Omit<AiPracticePreviewInput, 'teamId'>) => previewAiPractice(teamId, fields),
    onSuccess: (result, fields) => setPreview({ result, durationMinutes: fields.durationMinutes }),
  });
  const save = useMutation({
    mutationFn: () =>
      createAiPractice(teamId, {
        scheduledAt: localDateFromParts(start.date, start.time).toISOString(),
        durationMinutes: preview!.durationMinutes,
        plan: preview!.result.plan,
      }),
    onSuccess: ({ practiceId }) => {
      void queryClient.invalidateQueries({ queryKey: practicesQueryKey(teamId) });
      router.replace({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId } });
    },
  });

  const header = <Stack.Screen options={{ title: 'Generate with AI' }} />;
  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches can generate AI practices." />
      </View>
    );
  }

  const set = (patch: Partial<AiFormValues>) => setValues((current) => ({ ...current, ...patch }));
  const toggleSpace = (space: PracticeFieldSpace) =>
    set({ fieldSpaces: values.fieldSpaces.includes(space) ? values.fieldSpaces.filter((s) => s !== space) : [...values.fieldSpaces, space] });

  const submit = () => {
    const request = aiPreviewRequest(teamId, values);
    if ('problem' in request) {
      setProblem(request.problem);
      return;
    }
    setProblem(null);
    const { coachPrompt, durationMinutes, playerCount, availableFieldSpaces } = request.input;
    generate.mutate({ coachPrompt, durationMinutes, playerCount, availableFieldSpaces });
  };

  if (preview) {
    const { result, durationMinutes } = preview;
    const total = plannedMinutes(result.plan.blocks);
    return (
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <Text className="text-xs font-semibold text-amber-900 uppercase tracking-wide mb-1">Focus</Text>
          <Text className="text-sm text-amber-900">{result.plan.focusSummary}</Text>
        </View>
        <Text className="text-sm text-gray-500 mb-2">
          {total} / {durationMinutes} min planned
        </Text>
        {result.durationMismatchWarning && <Text className="text-xs text-amber-700 mb-2">{result.durationMismatchWarning}</Text>}
        {result.unknownDrillIds.length > 0 && (
          <Text className="text-xs text-amber-700 mb-2">
            {result.unknownDrillIds.length} suggested drill{result.unknownDrillIds.length === 1 ? ' was' : 's were'} not in your library and will be left out.
          </Text>
        )}
        <PlanBlocksList blocks={result.plan.blocks} drillsById={result.drillsById} />

        <FormField label="When" required>
          <DateTimeFields date={start.date} time={start.time} onChange={setStart} testID="ai-practice-start" />
        </FormField>
        {save.isError && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">{describeApiError(save.error)}</Text>
        )}
        <Button label="Save practice" size="lg" loading={save.isPending} disabled={save.isPending} onPress={() => save.mutate()} />
        <View className="mt-2">
          <Button label="Start over" variant="ghost" disabled={save.isPending} onPress={() => setPreview(null)} />
        </View>
      </ScrollView>
    );
  }

  const error = problem ?? (generate.isError ? describeApiError(generate.error) : null);
  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="text-sm text-gray-500 mb-4">
          Describe what you want to work on. Claude drafts a plan from your team&apos;s drill library for you to review and save.
        </Text>
        <FormField label="What should practice focus on?" required>
          <TextInput
            accessibilityLabel="Practice focus"
            className={`${inputClass} min-h-[100px]`}
            multiline
            textAlignVertical="top"
            value={values.prompt}
            onChangeText={(prompt) => set({ prompt })}
            placeholder="e.g. Defense after two sloppy games — bunt coverage and relays, plus some live BP."
            placeholderTextColor="#9ca3af"
          />
        </FormField>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <FormField label="Minutes">
              <TextInput accessibilityLabel="Minutes" className={inputClass} keyboardType="number-pad" value={values.duration} onChangeText={(duration) => set({ duration })} />
            </FormField>
          </View>
          <View className="flex-1">
            <FormField label="Players">
              <TextInput accessibilityLabel="Players" className={inputClass} keyboardType="number-pad" value={values.players} onChangeText={(players) => set({ players })} />
            </FormField>
          </View>
        </View>
        <FormField label="Field spaces available">
          <View className="flex-row flex-wrap gap-2">
            {Object.values(PracticeFieldSpace).map((space) => {
              const selected = values.fieldSpaces.includes(space);
              return (
                <TouchableOpacity
                  key={space}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => toggleSpace(space)}
                  className={`rounded-full border px-3 py-1.5 ${selected ? 'bg-brand-700 border-brand-700' : 'bg-white border-gray-300'}`}
                >
                  <Text className={`text-sm ${selected ? 'text-white font-semibold' : 'text-gray-700'}`}>{FIELD_SPACE_LABELS[space]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </FormField>
        {error && (
          <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <Text accessibilityRole="alert" className="text-sm text-red-700">{error}</Text>
          </View>
        )}
        <Button label={generate.isPending ? 'Drafting… (up to a minute)' : 'Generate practice'} size="lg" loading={generate.isPending} disabled={generate.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
