import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, FormField } from '@baseball/ui';
import { uploadPlayerDocumentInputSchema } from '@baseball/shared';
import { useRole } from '../../../../../../src/providers/RoleProvider';
import { ChoiceChips } from '../../../../../../src/features/practices/ChoiceChips';
import { DateTimeFields } from '../../../../../../src/features/forms/DateTimeFields';
import {
  playerDocumentsQueryKey,
  uploadPlayerDocument,
  usePlayerDocuments,
  type NewPlayerDocument,
} from '../../../../../../src/features/roster/documents-api';
import {
  DocumentFileError,
  formatFileSize,
  pickDocumentFile,
  type DocumentSource,
  type PickedFile,
} from '../../../../../../src/features/roster/document-file';
import { localToday } from '../../../../../../src/features/stats/season-stats-api';
import { describeApiError } from '../../../../../../src/lib/api-client';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';
const SOURCES: Array<{ source: DocumentSource; label: string }> = [
  { source: 'camera', label: 'Camera' },
  { source: 'library', label: 'Photos' },
  { source: 'files', label: 'Files' },
];

/**
 * Uploads a player document (the web page's upload form): a photo of a signed
 * form or a PDF, its type, title, signed and expiration dates and notes. A new
 * upload of a type supersedes the player's previous one. Roster managers only.
 */
export default function UploadPlayerDocumentScreen() {
  const { playerId = '' } = useLocalSearchParams<{ playerId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const query = usePlayerDocuments(teamId, playerId);
  const queryClient = useQueryClient();
  const today = localToday();

  const [file, setFile] = useState<PickedFile | null>(null);
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [signedOn, setSignedOn] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: ({ document, picked }: { document: NewPlayerDocument; picked: PickedFile }) =>
      uploadPlayerDocument(teamId as string, playerId, document, picked),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: playerDocumentsQueryKey(teamId ?? '', playerId) });
      router.back();
    },
  });

  const header = <Stack.Screen options={{ title: 'Upload document' }} />;
  if (query.isPending && teamId) {
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
        {teamId ? (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <EmptyState title="No team" message="Join a team to see its roster." />
        )}
      </View>
    );
  }

  const { documentTypes } = query.data;
  const activeType = documentTypes.find((type) => type.slug === documentType);
  const typeLabels = Object.fromEntries(documentTypes.map((type) => [type.slug, type.isTeamType ? `${type.name} (team)` : type.name]));

  const pick = async (source: DocumentSource) => {
    setProblem(null);
    try {
      const picked = await pickDocumentFile(source);
      if (picked) setFile(picked);
    } catch (error) {
      setProblem(error instanceof DocumentFileError ? error.message : 'Couldn’t open that file. Try another.');
    }
  };
  const pickType = (slug: string | null) => {
    // The title follows the type until the coach writes their own.
    const previousName = activeType?.name ?? '';
    if (slug && (title.trim() === '' || title === previousName)) {
      setTitle(documentTypes.find((type) => type.slug === slug)?.name ?? title);
    }
    setDocumentType(slug);
  };
  const submit = () => {
    if (!file) return setProblem('Pick a file to upload.');
    const parsed = uploadPlayerDocumentInputSchema.safeParse({
      teamId,
      playerId,
      documentType: documentType ?? '',
      title,
      signedOn,
      expiresOn,
      notes,
    });
    if (!parsed.success) return setProblem(parsed.error.issues[0].message);
    setProblem(null);
    const { documentType: type, title: cleanTitle, signedOn: signed, expiresOn: expires, notes: cleanNotes } = parsed.data;
    upload.mutate({ document: { documentType: type, title: cleanTitle, signedOn: signed, expiresOn: expires, notes: cleanNotes }, picked: file });
  };

  const error = problem ?? (upload.isError ? describeApiError(upload.error) : null);
  return (
    <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={96}>
      <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {header}
        <FormField label="File" required>
          {file ? (
            <View className="flex-row items-center justify-between bg-white rounded-lg border border-gray-300 px-3 py-2.5">
              <View className="flex-1 mr-3">
                <Text className="text-base text-gray-900" numberOfLines={1}>
                  {file.name}
                </Text>
                {file.size !== null && <Text className="text-xs text-gray-500">{formatFileSize(file.size)}</Text>}
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Remove file" onPress={() => setFile(null)} hitSlop={8}>
                <Text className="text-sm text-gray-500">Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-row gap-2">
              {SOURCES.map(({ source, label }) => (
                <View key={source} className="flex-1">
                  <Button label={label} variant="secondary" onPress={() => void pick(source)} />
                </View>
              ))}
            </View>
          )}
          <Text className="text-xs text-gray-500 mt-1">A PDF or a photo, 20 MB at most.</Text>
        </FormField>

        <FormField label="Document type" required>
          <ChoiceChips
            options={documentTypes.map((type) => type.slug)}
            labels={typeLabels}
            selected={documentType ? [documentType] : []}
            onChange={(picked) => pickType(picked.find((value) => value !== documentType) ?? null)}
          />
        </FormField>

        <FormField label="Title" required>
          <TextInput
            accessibilityLabel="Title"
            className={inputClass}
            placeholder="e.g. 2027 Spring Liability Waiver"
            placeholderTextColor="#9ca3af"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />
        </FormField>

        <OptionalDate label="Signed on" value={signedOn} today={today} onChange={setSignedOn} testID="signed-on" />
        <OptionalDate
          label="Expires on"
          value={expiresOn}
          today={today}
          onChange={setExpiresOn}
          hint={activeType?.requiresExpiration ? 'Recommended for this type.' : undefined}
          testID="expires-on"
        />

        <FormField label="Notes">
          <TextInput
            accessibilityLabel="Notes"
            className={`${inputClass} min-h-[72px]`}
            multiline
            textAlignVertical="top"
            value={notes}
            onChangeText={setNotes}
            maxLength={500}
          />
        </FormField>

        {error && (
          <Text accessibilityRole="alert" className="text-sm text-red-700 mb-3">
            {error}
          </Text>
        )}
        <Button label={upload.isPending ? 'Uploading…' : 'Upload document'} loading={upload.isPending} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A date the coach adds only when the document has one. */
function OptionalDate({
  label,
  value,
  today,
  onChange,
  hint,
  testID,
}: {
  label: string;
  value: string | null;
  today: string;
  onChange: (value: string | null) => void;
  hint?: string;
  testID: string;
}) {
  return (
    <FormField label={label}>
      {value ? (
        <View className="flex-row items-center gap-3">
          <DateTimeFields date={value} time="00:00" showTime={false} onChange={({ date }) => onChange(date)} testID={testID} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()} date`} onPress={() => onChange(null)}>
            <Text className="text-sm text-gray-500">Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={() => onChange(today)}>
          <Text className="text-sm font-semibold text-brand-700">Add a date</Text>
        </TouchableOpacity>
      )}
      {hint && <Text className="text-xs text-amber-700 mt-1">{hint}</Text>}
    </FormField>
  );
}
