import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { ThemeScope } from '../../theme/ThemeScope';
import { reportClientError } from '../../lib/error-report';

type ErrorFallbackVariant = 'app' | 'scorer';

const COPY: Record<ErrorFallbackVariant, { title: string; body: string; button: string }> = {
  app: {
    title: 'Something went wrong',
    body: 'Plays recorded on this phone are saved.',
    button: 'Try again',
  },
  scorer: {
    title: 'The scorer hit an error',
    body: 'Plays you already recorded are saved on this phone.',
    button: 'Reopen scorer',
  },
};

type ErrorFallbackProps = ErrorBoundaryProps & {
  variant: ErrorFallbackVariant;
  gameId?: string;
};

/**
 * The root boundary renders when the providers themselves may have crashed, so
 * this uses no provider hook: ThemeScope reads only its own context and
 * applies the Light palette's variables directly.
 */
export function ErrorFallback({ error, retry, variant, gameId }: ErrorFallbackProps) {
  useEffect(() => {
    reportClientError('render', error, {
      ...(gameId ? { gameId } : {}),
      details: { variant },
    });
  }, [error, variant, gameId]);

  const copy = COPY[variant];

  return (
    <ThemeScope theme="light" statusBar={false}>
      <View className="flex-1 items-center justify-center bg-white px-8">
        <Text className="text-xl font-bold text-gray-900 text-center">{copy.title}</Text>
        <Text className="text-base text-gray-600 text-center mt-2">{copy.body}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          className="bg-brand-700 rounded-xl px-6 py-3 mt-6"
        >
          <Text className="text-white font-semibold">{copy.button}</Text>
        </Pressable>
      </View>
    </ThemeScope>
  );
}
