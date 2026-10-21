import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
}

export function SectionHeader({ title, action }: SectionHeaderProps) {
  return (
    <View className="flex-row items-center justify-between px-1 pt-5 pb-2">
      <Text accessibilityRole="header" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </Text>
      {action && (
        <TouchableOpacity
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-sm font-semibold text-blue-700">{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
