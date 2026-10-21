import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

export function SegmentedControl<T extends string>({ options, value, onChange, testID }: SegmentedControlProps<T>) {
  return (
    <View testID={testID} accessibilityRole="tablist" className="flex-row rounded-lg bg-gray-100 p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) onChange(option.value);
            }}
            className={`flex-1 items-center rounded-md py-1.5 ${selected ? 'bg-white shadow-sm' : ''}`}
          >
            <Text className={`text-sm font-semibold ${selected ? 'text-gray-900' : 'text-gray-500'}`}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
