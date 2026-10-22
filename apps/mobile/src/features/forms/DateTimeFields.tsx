import { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { localDateFromParts, partsFromLocalDate } from './date-parts';

interface DateTimeFieldsProps {
  date: string;
  time: string;
  onChange: (parts: { date: string; time: string }) => void;
  testID?: string;
  /** False shows the time alone (an end time on the start's day). */
  showDate?: boolean;
}

/**
 * A date and a time, as the coach means them at the field. iOS shows the
 * compact inline pickers; Android opens its dialog from a button.
 */
export function DateTimeFields({ date, time, onChange, testID, showDate = true }: DateTimeFieldsProps) {
  const [androidPicker, setAndroidPicker] = useState<'date' | 'time' | null>(null);
  const value = localDateFromParts(date, time);
  const modes = showDate ? (['date', 'time'] as const) : (['time'] as const);

  const handle = (mode: 'date' | 'time') => (event: DateTimePickerEvent, picked?: Date) => {
    setAndroidPicker(null);
    if (event.type !== 'set' || !picked) return;
    const next = partsFromLocalDate(picked);
    onChange(mode === 'date' ? { date: next.date, time } : { date, time: next.time });
  };

  if (Platform.OS === 'ios') {
    return (
      <View testID={testID} className="flex-row items-center gap-2">
        {modes.map((mode) => (
          <DateTimePicker key={mode} value={value} mode={mode} display="compact" onChange={handle(mode)} />
        ))}
      </View>
    );
  }

  return (
    <View testID={testID} className="flex-row gap-2">
      {modes.map((mode) => (
        <TouchableOpacity
          key={mode}
          accessibilityRole="button"
          onPress={() => setAndroidPicker(mode)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 bg-white"
        >
          <Text className="text-base text-gray-900">{mode === 'date' ? date : time}</Text>
        </TouchableOpacity>
      ))}
      {androidPicker && <DateTimePicker value={value} mode={androidPicker} onChange={handle(androidPicker)} />}
    </View>
  );
}
