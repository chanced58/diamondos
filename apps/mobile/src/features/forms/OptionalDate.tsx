import { Text, TouchableOpacity, View } from 'react-native';
import { FormField } from '@baseball/ui';
import { DateTimeFields } from './DateTimeFields';

/** A date (`YYYY-MM-DD`) the user adds only when there is one; it starts on `today`. */
export function OptionalDate({
  label,
  value,
  today,
  onChange,
  hint,
  testID,
}: {
  label: string;
  value: string | null;
  today: string;
  onChange: (value: string | null) => void;
  hint?: string;
  testID: string;
}) {
  return (
    <FormField label={label}>
      {value ? (
        <View className="flex-row items-center gap-3">
          <DateTimeFields date={value} time="00:00" showTime={false} onChange={({ date }) => onChange(date)} testID={testID} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()} date`} onPress={() => onChange(null)}>
            <Text className="text-sm text-gray-500">Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity accessibilityRole="button" onPress={() => onChange(today)}>
          <Text className="text-sm font-semibold text-brand-700">Add a date</Text>
        </TouchableOpacity>
      )}
      {hint && <Text className="text-xs text-amber-700 mt-1">{hint}</Text>}
    </FormField>
  );
}
