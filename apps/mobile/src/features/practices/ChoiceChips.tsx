import { Text, TouchableOpacity, View } from 'react-native';
import { toggled } from './drill-form-model';

interface ChoiceChipsProps<T extends string> {
  options: readonly T[];
  labels: Record<T, string>;
  selected: readonly T[];
  onChange: (selected: T[]) => void;
}

/** A wrapping row of pills, any number selected — drill categories, field spaces and equipment. */
export function ChoiceChips<T extends string>({ options, labels, selected, onChange }: ChoiceChipsProps<T>) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <TouchableOpacity
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onChange(toggled(selected, option))}
            className={`rounded-full border px-3 py-1.5 ${isSelected ? 'bg-brand-700 border-brand-700' : 'bg-white border-gray-300'}`}
          >
            <Text className={`text-sm ${isSelected ? 'text-white font-semibold' : 'text-gray-700'}`}>{labels[option]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
