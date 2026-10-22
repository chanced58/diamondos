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
            // No conditional `shadow-*`: NativeWind shadows use CSS variables,
            // and gaining one after the first render forces a component
            // "upgrade" — whose dev warning crashes inside a navigator. A
            // border marks the selected segment without changing the class
            // shape between renders.
            className={`flex-1 items-center rounded-md py-1.5 px-2 border ${selected ? 'bg-white border-gray-200' : 'border-transparent'}`}
          >
            {/* One line, so a long label (an opponent's name) truncates instead of growing the control. */}
            <Text numberOfLines={1} className={`text-sm font-semibold ${selected ? 'text-gray-900' : 'text-gray-500'}`}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
