import React from 'react';
import { View, Text } from 'react-native';

type BadgeVariant = 'default' | 'safe' | 'warning' | 'danger';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantStyles: Record<BadgeVariant, { container: string; text: string }> = {
  default: { container: 'bg-gray-100', text: 'text-gray-700' },
  safe: { container: 'bg-green-100', text: 'text-green-800' },
  warning: { container: 'bg-amber-100', text: 'text-amber-800' },
  danger: { container: 'bg-red-100', text: 'text-red-800' },
};

export function Badge({ label, variant = 'default' }: BadgeProps) {
  const styles = variantStyles[variant];
  return (
    <View className={`px-2 py-0.5 rounded-full self-start ${styles.container}`}>
      <Text className={`text-xs font-medium ${styles.text}`}>{label}</Text>
    </View>
  );
}
