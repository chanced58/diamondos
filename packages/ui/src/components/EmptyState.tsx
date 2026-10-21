import React from 'react';
import { View, Text } from 'react-native';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-10">
      {icon && <View className="mb-3">{icon}</View>}
      <Text className="text-base font-semibold text-gray-700 text-center">{title}</Text>
      {message && <Text className="text-sm text-gray-500 text-center mt-1">{message}</Text>}
      {action && (
        <View className="mt-4">
          <Button label={action.label} variant="secondary" size="sm" onPress={action.onPress} />
        </View>
      )}
    </View>
  );
}
