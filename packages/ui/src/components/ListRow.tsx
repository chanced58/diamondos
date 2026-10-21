import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading element, e.g. an icon. */
  left?: React.ReactNode;
  /** Trailing element, e.g. a Badge. Shown before the chevron. */
  right?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** Defaults to true when the row is pressable. */
  showChevron?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

/** A tappable (or static) row for settings-style lists. */
export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  disabled = false,
  showChevron,
  testID,
  accessibilityLabel,
}: ListRowProps) {
  const chevron = showChevron ?? Boolean(onPress);
  const content = (
    <>
      {left && <View className="mr-3">{left}</View>}
      <View className="flex-1">
        <Text className={`text-base font-medium ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{title}</Text>
        {subtitle && (
          <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {right && <View className="ml-3">{right}</View>}
      {chevron && <Text className="ml-2 text-xl text-gray-300">›</Text>}
    </>
  );
  const className = `flex-row items-center bg-white px-4 py-3.5 min-h-[52px] ${disabled ? 'opacity-60' : ''}`;

  if (!onPress) {
    return (
      <View testID={testID} accessibilityLabel={accessibilityLabel} className={className}>
        {content}
      </View>
    );
  }
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      activeOpacity={0.7}
      className={className}
    >
      {content}
    </TouchableOpacity>
  );
}
