import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { EmptyState, ErrorState, ListRow } from '@baseball/ui';
import { SEASON_PHASE_LABELS, TEMPLATE_KIND_LABELS, type PracticeTemplateSummary } from '@baseball/shared';
import { ListGroup } from '../../../../../src/features/navigation/ListGroup';
import { applyPracticeTemplate, usePracticeTemplates } from '../../../../../src/features/practices/planning-api';
import { practiceQueryKey, practiceRunQueryKey, usePractice } from '../../../../../src/features/practices/practices-api';
import { describeApiError } from '../../../../../src/lib/api-client';

/**
 * Apply a template to a practice (the web plan editor's template picker):
 * after a confirmation, the template's blocks replace the practice's. Head
 * coaches and athletic directors, which the practice page already checks.
 */
export default function ApplyTemplateScreen() {
  const { practiceId = '' } = useLocalSearchParams<{ practiceId: string }>();
  const queryClient = useQueryClient();
  // The practice's own team, which may not be the active one (a link or notification).
  const practice = usePractice(practiceId);
  const query = usePracticeTemplates(practice.data?.practice.teamId);

  const apply = useMutation({
    mutationFn: (templateId: string) => applyPracticeTemplate(practiceId, templateId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: practiceQueryKey(practiceId) }),
        queryClient.invalidateQueries({ queryKey: practiceRunQueryKey(practiceId) }),
      ]);
      router.back();
    },
    onError: (error) => Alert.alert('Could not apply the template', describeApiError(error)),
  });

  const confirm = (template: PracticeTemplateSummary) =>
    Alert.alert(`Use ${template.name}?`, "Its blocks replace this practice's blocks.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace blocks', style: 'destructive', onPress: () => apply.mutate(template.id) },
    ]);

  const header = <Stack.Screen options={{ title: 'Apply a template' }} />;
  // The templates query waits for the practice, and stays pending if that fails.
  if (practice.isPending || (practice.data && query.isPending) || apply.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <ErrorState
          message={describeApiError(practice.error ?? query.error)}
          onRetry={() => void (practice.data ? query.refetch() : practice.refetch())}
        />
      </View>
    );
  }
  if (query.data.templates.length === 0) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No templates yet" message="Build a template on the web, then apply it here." />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <Text className="text-sm text-gray-500 mb-3">The template&apos;s blocks replace this practice&apos;s blocks.</Text>
      <ListGroup>
        {query.data.templates.map((template) => (
          <ListRow
            key={template.id}
            title={template.name}
            subtitle={`${TEMPLATE_KIND_LABELS[template.kind]} · ${SEASON_PHASE_LABELS[template.seasonPhase]} · ${template.defaultDurationMinutes} min`}
            onPress={() => confirm(template)}
          />
        ))}
      </ListGroup>
    </ScrollView>
  );
}
