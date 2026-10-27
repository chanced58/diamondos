import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { playerDocumentStatus, type PlayerDocument } from '@baseball/shared';
import { useRole } from '../../../../../../src/providers/RoleProvider';
import { ListGroup } from '../../../../../../src/features/navigation/ListGroup';
import {
  deletePlayerDocument,
  playerDocumentUrl,
  playerDocumentsQueryKey,
  usePlayerDocuments,
} from '../../../../../../src/features/roster/documents-api';
import { localToday } from '../../../../../../src/features/stats/season-stats-api';
import { describeApiError, isApiError } from '../../../../../../src/lib/api-client';

/** "Mar 4, 2027", read in the device's zone (documents carry plain dates). */
function shortDate(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * A player's documents (the web player documents page): waivers, medical
 * releases and other compliance files, newest first, each with its status.
 * Roster managers open, upload and delete them; a new upload of a type
 * supersedes the previous one.
 */
export default function PlayerDocumentsScreen() {
  const { playerId = '' } = useLocalSearchParams<{ playerId: string }>();
  const { activeTeam } = useRole();
  const teamId = activeTeam?.teamId ?? null;
  const query = usePlayerDocuments(teamId, playerId);
  const queryClient = useQueryClient();
  const today = localToday();

  const open = useMutation({
    mutationFn: (documentId: string) => playerDocumentUrl(teamId as string, playerId, documentId),
    onSuccess: (url) => void WebBrowser.openBrowserAsync(url),
    onError: (error) => Alert.alert('Couldn’t open the document', describeApiError(error)),
  });
  const remove = useMutation({
    mutationFn: (documentId: string) => deletePlayerDocument(teamId as string, playerId, documentId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: playerDocumentsQueryKey(teamId ?? '', playerId) }),
    onError: (error) => Alert.alert('Couldn’t delete the document', describeApiError(error)),
  });

  const upload = () => router.push({ pathname: '/(tabs)/more/roster/[playerId]/documents/new', params: { playerId } });
  const header = (
    <Stack.Screen
      options={{
        title: 'Documents',
        headerRight: query.data
          ? () => (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Upload a document" onPress={upload} hitSlop={12}>
                <Text className="text-white text-2xl font-light">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );
  if (query.isPending && teamId) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!query.data) {
    const forbidden = isApiError(query.error) && query.error.kind === 'forbidden';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        {!teamId ? (
          <EmptyState title="No team" message="Join a team to see its roster." />
        ) : forbidden ? (
          <EmptyState title="Coaches only" message="Coaches keep players’ waivers and other documents." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const { player, documents, documentTypes } = query.data;
  const typeName = (slug: string) => documentTypes.find((type) => type.slug === slug)?.name ?? slug;
  const subtitle = (doc: PlayerDocument) =>
    [
      typeName(doc.documentType),
      doc.signedOn && `Signed ${shortDate(doc.signedOn)}`,
      doc.expiresOn && `Expires ${shortDate(doc.expiresOn)}`,
    ]
      .filter(Boolean)
      .join(' · ');
  const documentActions = (doc: PlayerDocument) =>
    Alert.alert(doc.title, doc.notes ?? undefined, [
      { text: 'Open', onPress: () => open.mutate(doc.id) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`Delete ${doc.title}?`, 'The file is deleted too. This can’t be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => remove.mutate(doc.id) },
          ]),
      },
      { text: 'Close', style: 'cancel' },
    ]);
  const busy = open.isPending || remove.isPending;

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <Text className="text-xl font-bold text-gray-900">
        {player.firstName} {player.lastName}
        {player.jerseyNumber != null && <Text className="text-gray-400 font-normal"> #{player.jerseyNumber}</Text>}
      </Text>
      <Text className="text-sm text-gray-500 mt-1">Liability waivers, medical releases and other compliance documents.</Text>

      <SectionHeader title={`Documents (${documents.length})`} />
      {documents.length === 0 ? (
        <View className="bg-white rounded-xl border border-gray-200 p-4">
          <Text className="text-sm text-gray-500 mb-3">No documents uploaded yet.</Text>
          <Button label="Upload a document" onPress={upload} />
        </View>
      ) : (
        <ListGroup>
          {documents.map((doc) => {
            const status = playerDocumentStatus(doc, today);
            return (
              <ListRow
                key={doc.id}
                title={doc.title}
                subtitle={subtitle(doc)}
                right={<Badge label={status.label} variant={status.tone} />}
                onPress={busy ? undefined : () => documentActions(doc)}
              />
            );
          })}
        </ListGroup>
      )}
    </ScrollView>
  );
}
