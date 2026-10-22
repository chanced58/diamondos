import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';

export interface SheetOption {
  key: string;
  label: string;
  onPress: () => void;
}

/** A bottom sheet of choices (a batting slot, a position); tapping outside closes it. */
export function OptionSheet({
  title,
  options,
  onClose,
}: {
  /** Null hides the sheet. */
  title: string | null;
  options: SheetOption[];
  onClose: () => void;
}) {
  return (
    <Modal visible={title !== null} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity className="flex-1 justify-end bg-black/50" activeOpacity={1} onPress={onClose}>
        {/* Claims its own touches, so a tap on the title or padding doesn't reach the backdrop and close it. */}
        <View
          className="bg-white rounded-t-2xl px-5 pb-8 pt-5"
          style={{ maxHeight: '70%' }}
          onStartShouldSetResponder={() => true}
        >
          <Text className="text-base font-bold text-gray-900 mb-3">{title}</Text>
          <ScrollView>
            {options.map((option) => (
              <TouchableOpacity
                key={option.key}
                accessibilityRole="button"
                onPress={option.onPress}
                className="border-b border-gray-100 py-3"
              >
                <Text className="text-sm text-gray-900">{option.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
