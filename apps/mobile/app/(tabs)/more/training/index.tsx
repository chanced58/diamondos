import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Badge, Button, ErrorState, ListRow } from '@baseball/ui';
import { TRAINING_MODULES, nextIncompleteSlug } from '@baseball/shared';
import { ListGroup } from '../../../../src/features/navigation/ListGroup';
import { useTrainingProgress } from '../../../../src/features/training/training-api';
import { progressLabel, totalMinutes } from '../../../../src/features/training/quiz-model';
import { describeApiError } from '../../../../src/lib/api-client';

/**
 * DiamondOS training (the web /training page): five short modules, each with
 * a quiz, and the Certified badge once every quiz is passed. Progress is the
 * same on the web and the phone.
 */
export default function TrainingScreen() {
  const query = useTrainingProgress();

  const header = <Stack.Screen options={{ title: 'Training' }} />;
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

  const progress = query.data;
  const next = nextIncompleteSlug(progress.completedSlugs);
  const started = progress.completedSlugs.length > 0;
  const openModule = (slug: string) => router.push({ pathname: '/(tabs)/more/training/[slug]', params: { slug } });

  return (
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
    >
      {header}
      <View className="flex-row items-center gap-2">
        <Text className="text-2xl font-bold text-gray-900">Training</Text>
        {progress.isCertified && <Badge label="Certified" variant="safe" />}
      </View>
      <Text className="text-sm text-gray-600 mt-2">
        Five short modules that walk you through how to use DiamondOS — navigation, rosters, scoring, pitch-count compliance, and messaging.
        Complete every module's quiz to earn the Certified badge. Total time: about {totalMinutes()} minutes.
      </Text>

      <View className="bg-white rounded-xl border border-gray-200 p-4 mt-4">
        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your progress</Text>
        <Text className="text-xl font-bold text-gray-900 mt-0.5">{progressLabel(progress.completedSlugs)}</Text>
        <View className="mt-3">
          {next ? (
            <Button label={started ? 'Resume' : 'Start training'} onPress={() => openModule(next)} />
          ) : (
            <Badge label="All modules complete" variant="safe" />
          )}
        </View>
      </View>

      <View className="mt-4">
        <ListGroup>
          {TRAINING_MODULES.map((module, index) => {
            const done = progress.completedSlugs.includes(module.slug);
            return (
              <ListRow
                key={module.slug}
                title={`${index + 1}. ${module.title}`}
                subtitle={`${module.estimatedMinutes} min · ${module.quiz.length} questions`}
                right={done ? <Badge label="Done" variant="safe" /> : undefined}
                onPress={() => openModule(module.slug)}
              />
            );
          })}
        </ListGroup>
      </View>
    </ScrollView>
  );
}
