import { useState } from 'react';
import { ActivityIndicator, RefreshControl, SectionList, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Badge, EmptyState, ErrorState, ListRow, SectionHeader } from '@baseball/ui';
import type { PracticeSummary } from '@baseball/shared';
import { useRole } from '../../../../src/providers/RoleProvider';
import { TeamSwitcher } from '../../../../src/features/teams/TeamSwitcher';
import { OptionSheet } from '../../../../src/features/opponents/OptionSheet';
import { usePractices } from '../../../../src/features/practices/practices-api';
import { RUN_STATUS_LABELS, practiceWhen, splitPractices } from '../../../../src/features/practices/practice-format';
import { describeApiError, isApiError } from '../../../../src/lib/api-client';

/**
 * The team's practices (the web Practices list): upcoming first, then past.
 * Coaches start a new one from the header — logged, generated with AI or
 * prepped for the next game — and reach the team's templates there. On a
 * plan without practice planning the server refuses, and so does this screen.
 */
export default function PracticesIndex() {
  const { activeTeam, loading: roleLoading } = useRole();
  const query = usePractices(activeTeam?.teamId);
  const isCoach = query.data?.isCoach ?? false;
  const [choosing, setChoosing] = useState(false);
  const go = (path: '/(tabs)/more/practices/new' | '/(tabs)/more/practices/ai' | '/(tabs)/more/practices/prep' | '/(tabs)/more/practices/templates') => () => {
    setChoosing(false);
    router.push(path);
  };

  const header = (
    <Stack.Screen
      options={{
        title: 'Practices',
        headerRight: isCoach
          ? () => (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="New practice"
                hitSlop={8}
                onPress={() => setChoosing(true)}
              >
                <Text className="text-white text-2xl font-semibold">+</Text>
              </TouchableOpacity>
            )
          : undefined,
      }}
    />
  );

  if (roleLoading || (activeTeam && query.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        {header}
        <ActivityIndicator />
      </View>
    );
  }
  if (!activeTeam) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="No team" message="Join a team to see its practices." />
      </View>
    );
  }
  if (!query.data) {
    const notOnPlan = isApiError(query.error) && query.error.kind === 'forbidden';
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <TeamSwitcher />
        {notOnPlan ? (
          <EmptyState title="Practice planning" message="Practice planning is available on the Starter plan and above." />
        ) : (
          <ErrorState message={describeApiError(query.error)} onRetry={() => void query.refetch()} />
        )}
      </View>
    );
  }

  const { upcoming, past } = splitPractices(query.data.practices);
  const sections = [
    { title: 'Upcoming', data: upcoming },
    { title: 'Past', data: past },
  ].filter((section) => section.data.length > 0);

  return (
    <View className="flex-1 bg-gray-50">
      {header}
      <OptionSheet
        title={choosing ? 'Practices' : null}
        options={[
          { key: 'new', label: 'Log a practice', onPress: go('/(tabs)/more/practices/new') },
          { key: 'ai', label: 'Generate with AI', onPress: go('/(tabs)/more/practices/ai') },
          { key: 'prep', label: 'Prep for next game', onPress: go('/(tabs)/more/practices/prep') },
          { key: 'templates', label: 'Templates', onPress: go('/(tabs)/more/practices/templates') },
        ]}
        onClose={() => setChoosing(false)}
      />
      <TeamSwitcher />
      <SectionList
        sections={sections}
        keyExtractor={(practice) => practice.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
        renderItem={({ item }) => <PracticeRow practice={item} />}
        ListEmptyComponent={
          <EmptyState
            title="No practices yet"
            message={isCoach ? 'Tap + to log a practice.' : 'Practices your coaches schedule show up here.'}
          />
        }
      />
    </View>
  );
}

/** One practice in the list: when and where, with its game-prep and run-status badges. */
function PracticeRow({ practice }: { practice: PracticeSummary }) {
  const status = RUN_STATUS_LABELS[practice.runStatus];
  return (
    <View className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-2">
      <ListRow
        title={practiceWhen(practice)}
        subtitle={practice.location ?? undefined}
        right={
          practice.isPrep || status ? (
            <View className="items-end gap-1">
              {practice.isPrep && <Badge label="Game prep" variant="warning" />}
              {status && <Badge label={status} variant={practice.runStatus === 'running' ? 'safe' : 'default'} />}
            </View>
          ) : undefined
        }
        onPress={() => router.push({ pathname: '/(tabs)/more/practices/[practiceId]', params: { practiceId: practice.id } })}
      />
    </View>
  );
}
