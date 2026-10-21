import React from 'react';
import { View, Text } from 'react-native';

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
}

/**
 * Label, hint and error around any control (a TextInput, a
 * SegmentedControl, a picker). `Input` covers the plain text case.
 */
export function FormField({ label, children, error, hint, required = false }: FormFieldProps) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <Text className="text-red-600"> *</Text>}
      </Text>
      {children}
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-600 mt-1">{error}</Text>
      ) : hint ? (
        <Text className="text-xs text-gray-500 mt-1">{hint}</Text>
      ) : null}
    </View>
  );
}
