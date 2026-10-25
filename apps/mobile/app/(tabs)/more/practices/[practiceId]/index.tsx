import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import { formatDate, type PracticeDetailResponse } from '@baseball/shared';
import { ListGroup } from '../../../../../src/features/navigation/ListGroup';
import {
  cancelPractice,
  practiceQueryKey,
  practicesQueryKey,
  savePracticePlan,
  usePractice,
} from '../../../../../src/features/practices/practices-api';
import { practiceWhen } from '../../../../../src/features/practices/practice-format';
import { RepLogger } from '../../../../../src/features/practices/RepLogger';
import { HittersPanel } from '../../../../../src/features/practices/HittersPanel';
import { PlayerNotesCard } from '../../../../../src/features/practices/PlayerNotesCard';
import { SummaryCard } from '../../../../../src/features/practices/SummaryCard';
import { deviceTimeZone } from '../../../../../src/features/games/game-form-model';
import { describeApiError } from '../../../../../src/lib/api-client';
import { openOnWeb, webUrl } from '../../../../../src/lib/web-links';

/**
 * One practice, shown by role as on the web practice page. Coaches run it,
 * take attendance, edit the plan, write notes, log BP reps and see hot/cold
 * hitters, and can cancel it; a player sees their notes and writes their own;
 * a parent reads each child's.
 */
export default function PracticeScreen() {
  const { practiceId = '' } = useLocalSearchParams<{ practiceId: string }>();
  const queryClient = useQueryClient();
  const query = usePractice(practiceId);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: practiceQueryKey(practiceId) });

  const header = <Stack.Screen options={{ title: 'Practice' }} />;

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

  const detail = query.data;
  const { practice, coach } = detail;
  const cancelled = practice.status === 'cancelled';

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <Text className="text-xl font-bold text-gray-900">{practiceWhen(practice)}</Text>
      {practice.location && <Text className="text-sm text-gray-600 mt-0.5">{practice.location}</Text>}
      {practice.address && practice.address !== practice.location && (
        <Text className="text-xs text-gray-500">{practice.address}</Text>
      )}
      {cancelled && (
        <View className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
          <Text className="text-sm font-medium text-red-800">This practice was cancelled.</Text>
        </View>
      )}
      {practice.prep && (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-3 mt-3">
          <Text className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Prepping for</Text>
          <Text className="text-sm font-medium text-amber-900">
            vs {practice.prep.opponentName} · {formatDate(practice.prep.scheduledAt)}
          </Text>
          {practice.prep.focusSummary && <Text className="text-xs text-amber-900/80 mt-1">{practice.prep.focusSummary}</Text>}
        </View>
      )}

      <Actions detail={detail} />

      {coach ? (
        <>
          <PlanEditor practiceId={practiceId} plan={practice.plan ?? ''} onSaved={refresh} />
          <SectionHeader title="Notes" />
          <ListGroup>
            <ListRow
              title="Practice notes"
              subtitle={notesSummary(detail)}
              onPress={() => router.push({ pathname: '/(tabs)/more/practices/[practiceId]/notes', params: { practiceId } })}
            />
          </ListGroup>
          {!cancelled && (
            <>
              <SectionHeader title="Batting practice" />
              <RepLogger practiceId={practiceId} players={coach.players} onLogged={refresh} />
              <HittersPanel hitters={coach.hitters} players={coach.players} />
              <SectionHeader title="Summary" />
              <SummaryCard practiceId={practiceId} players={coach.players} />
            </>
          )}
          {!cancelled && <CancelButton practiceId={practiceId} teamId={practice.teamId} scheduledAt={practice.scheduledAt} />}
        </>
      ) : (
        <>
          {practice.plan && (
            <>
              <SectionHeader title="Practice plan" />
              <View className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <Text className="text-sm text-gray-800">{practice.plan}</Text>
              </View>
            </>
          )}
          <SectionHeader title="Overall notes" />
          <View className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
            <Text className={`text-sm ${detail.overallNotes ? 'text-gray-800' : 'text-gray-400 italic'}`}>
              {detail.overallNotes ?? 'No notes posted yet.'}
            </Text>
          </View>
          {detail.myPlayers.map((player) => (
            <PlayerNotesCard
              key={player.playerId}
              practiceId={practiceId}
              player={player}
              showName={detail.viewer === 'parent'}
              onSaved={refresh}
            />
          ))}
        </>
      )}
    </ScrollView>
  );
}

/** The rows that lead off the page: the runner, attendance and the web plan builder for coaches; the rotation card for a player. */
function Actions({ detail }: { detail: PracticeDetailResponse }) {
  const { practice } = detail;
  const practiceId = practice.id;
  const rows: Array<{ key: string; title: string; subtitle?: string; onPress: () => void }> = [];

  if (detail.viewer === 'coach' && practice.status !== 'cancelled') {
    rows.push({
      key: 'run',
      title: practice.runStatus === 'running' ? 'Resume practice' : practice.runStatus === 'completed' ? 'Practice runner' : 'Run practice',
      subtitle: 'Block-by-block timer',
      onPress: () => router.push({ pathname: '/(tabs)/more/practices/[practiceId]/run', params: { practiceId } }),
    });
    rows.push({
      key: 'attendance',
      title: 'Attendance',
      onPress: () => router.push({ pathname: '/(tabs)/more/practices/[practiceId]/attendance', params: { practiceId } }),
    });
    // Applying a template replaces the blocks, so only before the practice starts.
    if (detail.coach?.canEditStructure && practice.runStatus === 'not_started') {
      rows.push({
        key: 'template',
        title: 'Apply a template',
        subtitle: "Replaces the practice's blocks",
        onPress: () => router.push({ pathname: '/(tabs)/more/practices/[practiceId]/template', params: { practiceId } }),
      });
    }
    if (webUrl('/')) {
      rows.push({
        key: 'plan',
        title: 'Build the practice plan',
        subtitle: 'Blocks and stations · opens on the web',
        onPress: () => void openOnWeb(`/practices/${practiceId}/plan`),
      });
    }
  }
  if (detail.viewer === 'player') {
    rows.push({
      key: 'card',
      title: 'My rotation',
      subtitle: 'Where to be, block by block',
      onPress: () => router.push({ pathname: '/(tabs)/more/practices/[practiceId]/card', params: { practiceId } }),
    });
  }
  if (rows.length === 0) return null;

  return (
    <View className="mt-4">
      <ListGroup>
        {rows.map((row) => (
          <ListRow key={row.key} title={row.title} subtitle={row.subtitle} onPress={row.onPress} />
        ))}
      </ListGroup>
    </View>
  );
}

/** The notes row's subtitle: whether overall notes exist, and how many players have notes. */
function notesSummary(detail: PracticeDetailResponse): string {
  const written = Object.keys(detail.coach?.playerNotes ?? {}).length;
  const overall = detail.overallNotes ? 'Overall notes written' : 'No overall notes yet';
  return written > 0 ? `${overall} · ${written} player${written === 1 ? '' : 's'}` : overall;
}

/** The coach's plan text, with a Save button that appears once it is edited. */
function PlanEditor({ practiceId, plan, onSaved }: { practiceId: string; plan: string; onSaved: () => void }) {
  const [draft, setDraft] = useState(plan);
  const save = useMutation({ mutationFn: () => savePracticePlan(practiceId, draft), onSuccess: onSaved });

  return (
    <>
      <SectionHeader title="Practice plan" />
      <TextInput
        accessibilityLabel="Practice plan"
        className="border border-gray-300 rounded-xl px-3 py-2.5 text-gray-900 bg-white text-base min-h-[100px] mb-2"
        multiline
        textAlignVertical="top"
        value={draft}
        onChangeText={setDraft}
        placeholder="What's the plan? Players and parents see this."
        placeholderTextColor="#9ca3af"
      />
      {save.isError && <Text accessibilityRole="alert" className="text-xs text-red-700 mb-2">{describeApiError(save.error)}</Text>}
      {draft !== plan && <Button label="Save plan" loading={save.isPending} onPress={() => save.mutate()} />}
    </>
  );
}

/** Cancels the practice once the coach picks quietly or with a team announcement, then leaves the page. */
function CancelButton({ practiceId, teamId, scheduledAt }: { practiceId: string; teamId: string; scheduledAt: string }) {
  const queryClient = useQueryClient();
  const cancel = useMutation({
    mutationFn: (notifyTeam: boolean) => cancelPractice(practiceId, { notifyTeam, timeZone: deviceTimeZone() }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: practicesQueryKey(teamId) });
      void queryClient.invalidateQueries({ queryKey: practiceQueryKey(practiceId) });
      router.back();
    },
    onError: (error) => Alert.alert('Could not cancel the practice', describeApiError(error)),
  });

  const confirm = () =>
    Alert.alert(`Cancel the practice on ${formatDate(scheduledAt)}?`, 'It comes off the schedule.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel quietly', style: 'destructive', onPress: () => cancel.mutate(false) },
      { text: 'Cancel and notify team', style: 'destructive', onPress: () => cancel.mutate(true) },
    ]);

  return (
    <View className="mt-6">
      <Button label="Cancel practice" variant="danger" loading={cancel.isPending} disabled={cancel.isPending} onPress={confirm} />
    </View>
  );
}
