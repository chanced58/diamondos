import { Text, TextInput, View, type TextInputProps } from 'react-native';

const inputClass = 'border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 bg-white text-base';

/** A multi-line notes box. */
export function NoteInput(props: TextInputProps) {
  return (
    <TextInput
      multiline
      textAlignVertical="top"
      className={inputClass}
      style={{ minHeight: 96 }}
      placeholderTextColor="#9ca3af"
      {...props}
    />
  );
}

/** Read-only notes, or an italic placeholder when there are none. */
export function NoteBody({ text, emptyText }: { text: string | null | undefined; emptyText: string }) {
  const hasText = Boolean(text && text.trim() !== '');
  return (
    <View className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <Text className={hasText ? 'text-sm text-gray-800' : 'text-sm text-gray-400 italic'}>
        {hasText ? text : emptyText}
      </Text>
    </View>
  );
}

/** A section heading with a small audience tag on the right ("Coaches only"). */
export function NoteHeading({ title, tag }: { title: string; tag?: string }) {
  return (
    <View className="flex-row items-center justify-between mt-5 mb-2">
      <Text accessibilityRole="header" className="text-base font-semibold text-gray-900">{title}</Text>
      {tag && (
        <View className="bg-gray-100 rounded-full px-2 py-0.5">
          <Text className="text-xs text-gray-500">{tag}</Text>
        </View>
      )}
    </View>
  );
}
