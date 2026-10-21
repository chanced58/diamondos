import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** Full-area error with an optional retry, matching the app's existing error banners. */
export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-full bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
        <Text accessibilityRole="alert" className="text-sm text-red-700">{message}</Text>
      </View>
      {onRetry && (
        <TouchableOpacity
          accessibilityRole="button"
          className="px-4 py-2 rounded-lg bg-white border border-gray-200"
          onPress={onRetry}
        >
          <Text className="text-sm font-semibold text-gray-700">{retryLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
