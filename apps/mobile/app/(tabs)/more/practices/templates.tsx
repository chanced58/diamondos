import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState } from '@baseball/ui';
import { SEASON_PHASE_LABELS, TEMPLATE_KIND_LABELS, type PracticeTemplateSummary } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import {
  archivePracticeTemplate,
  duplicatePracticeTemplate,
  practiceTemplatesQueryKey,
  usePracticeTemplates,
} from '../../../../src/features/practices/planning-api';
import { describeApiError } from '../../../../src/lib/api-client';
import { openOnWeb, webUrl } from '../../../../src/lib/web-links';

/**
 * The team's practice templates (the web Templates page): duplicate one
 * under a new name or archive it. Building and editing a template's blocks
 * stays on the web, linked from here. Coaches only.
 */
export default function PracticeTemplatesScreen() {
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? '';
  const query = usePracticeTemplates(activeTeam?.isCoach ? teamId : undefined);

  const header = <Stack.Screen options={{ title: 'Templates' }} />;
  if (!activeTeam?.isCoach) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Coaches only" message="Only coaches manage practice templates." />
      </View>
    );
  }
  if (query.isPending) {
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
        <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
      </View>
    );
  }

  const templates = query.data.templates;
  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      {templates.length === 0 ? (
        <EmptyState title="No templates yet" message="Build a template on the web, then apply it to any practice from here." />
      ) : (
        templates.map((template) => <TemplateRow key={template.id} teamId={teamId} template={template} />)
      )}
      {webUrl('/') && (
        <View className="mt-2">
          <Button label="Build and edit templates on the web" variant="ghost" onPress={() => void openOnWeb('/practices/templates')} />
        </View>
      )}
    </ScrollView>
  );
}

/** One template, with its duplicate (renamed inline) and archive actions. */
function TemplateRow({ teamId, template }: { teamId: string; template: PracticeTemplateSummary }) {
  const queryClient = useQueryClient();
  const [copyName, setCopyName] = useState<string | null>(null);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: practiceTemplatesQueryKey(teamId) });

  const duplicate = useMutation({
    mutationFn: (newName: string) => duplicatePracticeTemplate(template.id, newName),
    onSuccess: () => {
      setCopyName(null);
      refresh();
    },
  });
  const archive = useMutation({
    mutationFn: () => archivePracticeTemplate(template.id),
    onSuccess: refresh,
    onError: (error) => Alert.alert('Could not archive the template', describeApiError(error)),
  });

  const confirmArchive = () =>
    Alert.alert(`Archive ${template.name}?`, 'It leaves the list; practices already built from it keep their blocks.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => archive.mutate() },
    ]);

  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-2">
      <Text className="text-base font-semibold text-gray-900">{template.name}</Text>
      <Text className="text-xs text-gray-500 mt-0.5">
        {TEMPLATE_KIND_LABELS[template.kind]} · {SEASON_PHASE_LABELS[template.seasonPhase]} · {template.defaultDurationMinutes} min
        {template.isIndoorFallback ? ' · Indoor' : ''}
      </Text>
      {template.description && <Text className="text-sm text-gray-600 mt-1">{template.description}</Text>}

      {copyName === null ? (
        <View className="flex-row gap-4 mt-3">
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Duplicate ${template.name}`} onPress={() => setCopyName(`${template.name} (copy)`)}>
            <Text className="text-sm font-semibold text-brand-700">Duplicate</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Archive ${template.name}`} disabled={archive.isPending} onPress={confirmArchive}>
            <Text className={`text-sm font-semibold text-red-600 ${archive.isPending ? 'opacity-50' : ''}`}>Archive</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="mt-3">
          <TextInput
            accessibilityLabel="Name for the copy"
            className="border border-gray-300 rounded-lg px-3 py-2 text-gray-900 bg-white text-base mb-2"
            value={copyName}
            onChangeText={setCopyName}
            autoFocus
          />
          {duplicate.isError && (
            <Text accessibilityRole="alert" className="text-xs text-red-700 mb-2">{describeApiError(duplicate.error)}</Text>
          )}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button label="Save copy" size="sm" loading={duplicate.isPending} disabled={duplicate.isPending || !copyName.trim()} onPress={() => duplicate.mutate(copyName)} />
            </View>
            <View className="flex-1">
              <Button label="Cancel" size="sm" variant="secondary" disabled={duplicate.isPending} onPress={() => setCopyName(null)} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
