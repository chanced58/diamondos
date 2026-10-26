import { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, EmptyState, SectionHeader } from '@baseball/ui';
import { getModuleBySlug, type QuizQuestion, type TrainingSection } from '@baseball/shared';
import { completeTrainingModule, trainingProgressQueryKey, useTrainingProgress } from '../../../../src/features/training/training-api';
import { allAnswered, allRight, gradeQuiz, type QuizResult } from '../../../../src/features/training/quiz-model';
import { describeApiError } from '../../../../src/lib/api-client';

/**
 * One training module (the web /training/:slug page): its lessons, then the
 * quiz. Every question right completes it — unlimited retries — and the last
 * module earns the Certified badge. A finished module opens the next one.
 */
export default function TrainingModuleScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const module = getModuleBySlug(slug);
  const progress = useTrainingProgress();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, QuizResult> | null>(null);

  const complete = useMutation({
    mutationFn: () => completeTrainingModule(slug),
    onSuccess: (data) => {
      queryClient.setQueryData(trainingProgressQueryKey, data.progress);
      // The screen is replaced below, so certification is announced in an alert that outlives it.
      if (data.certifiedNow) Alert.alert('DiamondOS Certified', 'Module complete — you are now DiamondOS Certified!');
      if (data.nextSlug) router.replace({ pathname: '/(tabs)/more/training/[slug]', params: { slug: data.nextSlug } });
      else router.replace('/(tabs)/more/training');
    },
  });

  const header = <Stack.Screen options={{ title: module?.title ?? 'Training' }} />;
  if (!module) {
    return (
      <View className="flex-1 bg-gray-50">
        {header}
        <EmptyState title="Module not found" message="This training module isn't in the current curriculum." />
      </View>
    );
  }

  const done = progress.data?.completedSlugs.includes(module.slug) ?? false;
  const pick = (questionId: string, optionId: string) => {
    setAnswers((current) => ({ ...current, [questionId]: optionId }));
    setResults(null);
  };
  const passed = results ? allRight(results, module.quiz) : false;

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      {header}
      <Text className="text-xs text-gray-500">
        {module.estimatedMinutes} min · {module.quiz.length} questions
      </Text>
      <Text className="text-2xl font-bold text-gray-900 mt-1">{module.title}</Text>
      <Text className="text-sm text-gray-600 mt-1">{module.summary}</Text>
      {done && (
        <View className="flex-row mt-2">
          <Badge label="✓ Already completed" variant="safe" />
        </View>
      )}

      <View className="bg-white rounded-xl border border-gray-200 p-4 mt-4 gap-4">
        {module.sections.map((section, index) => (
          <Section key={index} section={section} />
        ))}
      </View>

      <SectionHeader title="Quiz" />
      <Text className="text-sm text-gray-600 mb-3">Answer every question correctly to complete the module. Unlimited retries.</Text>
      {module.quiz.map((question, index) => (
        <Question
          key={question.id}
          number={index + 1}
          question={question}
          selected={answers[question.id]}
          result={results?.[question.id] ?? 'unanswered'}
          onPick={(optionId) => pick(question.id, optionId)}
        />
      ))}

      {complete.isError && (
        <Text accessibilityRole="alert" className="text-sm text-red-700 mb-2">
          {describeApiError(complete.error)}
        </Text>
      )}
      {passed ? (
        <Button label={done ? 'Complete again' : 'Complete module'} size="lg" loading={complete.isPending} onPress={() => complete.mutate()} />
      ) : (
        <Button
          label="Check answers"
          size="lg"
          disabled={!allAnswered(module.quiz, answers)}
          onPress={() => setResults(gradeQuiz(module.quiz, answers))}
        />
      )}
      {passed && !complete.isSuccess && <Text className="text-sm text-green-800 mt-2">All correct — complete the module to record it.</Text>}
    </ScrollView>
  );
}

/** A lesson section: prose, a list, or a callout, as the web module shows them. */
function Section({ section }: { section: TrainingSection }) {
  if (section.kind === 'prose') {
    return (
      <View>
        <Text className="text-base font-semibold text-gray-900 mb-1">{section.heading}</Text>
        <Text className="text-sm text-gray-800 leading-5">{section.body}</Text>
      </View>
    );
  }
  if (section.kind === 'list') {
    return (
      <View>
        <Text className="text-base font-semibold text-gray-900 mb-1">{section.heading}</Text>
        {section.items.map((item, index) => (
          <Text key={index} className="text-sm text-gray-800 leading-5 mb-1">
            • {item}
          </Text>
        ))}
      </View>
    );
  }
  const warning = section.tone === 'warning';
  return (
    <View className={`rounded-lg border-l-4 px-3 py-2.5 ${warning ? 'border-amber-500 bg-amber-50' : 'border-blue-500 bg-blue-50'}`}>
      <Text className="text-sm text-gray-900 leading-5">{section.body}</Text>
    </View>
  );
}

/** One quiz question with its options; after checking, says right or wrong with the explanation. */
function Question({
  number,
  question,
  selected,
  result,
  onPick,
}: {
  number: number;
  question: QuizQuestion;
  selected: string | undefined;
  result: QuizResult;
  onPick: (optionId: string) => void;
}) {
  return (
    <View className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
      <Text className="text-xs font-semibold text-gray-500">Question {number}</Text>
      <Text className="text-base text-gray-900 mt-1 mb-2">{question.prompt}</Text>
      {question.options.map((option) => {
        const isSelected = selected === option.id;
        return (
          <TouchableOpacity
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onPick(option.id)}
            className={`flex-row items-start rounded-lg px-3 py-2 mb-1 ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
          >
            <View className={`w-4 h-4 rounded-full border-2 mt-0.5 mr-2 ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-gray-400'}`} />
            <Text className="flex-1 text-sm text-gray-900">{option.label}</Text>
          </TouchableOpacity>
        );
      })}
      {result !== 'unanswered' && (
        <View className={`rounded-lg px-3 py-2 mt-2 ${result === 'right' ? 'bg-green-50' : 'bg-red-50'}`}>
          <Text className={`text-sm font-semibold ${result === 'right' ? 'text-green-800' : 'text-red-800'}`}>
            {result === 'right' ? 'Correct' : 'Not quite'}
          </Text>
          <Text className="text-sm text-gray-800 mt-0.5">{question.explanation}</Text>
        </View>
      )}
    </View>
  );
}
