import type { ReactNode } from 'react';
import { Switch, Text, TouchableOpacity, View } from 'react-native';

/** A titled card of settings, as the web form's sections. */
export function SettingSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="text-base font-semibold text-gray-900">{title}</Text>
      {description ? <Text className="text-xs text-gray-500 mt-0.5 mb-2">{description}</Text> : <View className="mb-2" />}
      <View className="bg-white border border-gray-200 rounded-lg px-3">{children}</View>
    </View>
  );
}

interface SettingSwitchProps {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

export function SettingSwitch({ label, value, disabled, onChange }: SettingSwitchProps) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-100">
      <Text className={`flex-1 mr-3 text-base ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

interface SettingStepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}

/** A whole number from `min` to `max`, stepped one at a time. */
export function SettingStepper({ label, value, min, max, disabled, onChange }: SettingStepperProps) {
  const step = (by: number) => onChange(Math.min(max, Math.max(min, value + by)));
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-100">
      <View className="flex-1 mr-3">
        <Text className={`text-base ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{label}</Text>
        <Text className="text-xs text-gray-400">
          {min}–{max}
        </Text>
      </View>
      <View className="flex-row items-center">
        <StepButton symbol="−" label={`Decrease ${label}`} disabled={disabled || value <= min} onPress={() => step(-1)} />
        <Text accessibilityLabel={`${label}: ${value}`} className={`w-10 text-center text-base font-semibold ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>
          {value}
        </Text>
        <StepButton symbol="+" label={`Increase ${label}`} disabled={disabled || value >= max} onPress={() => step(1)} />
      </View>
    </View>
  );
}

function StepButton({ symbol, label, disabled, onPress }: { symbol: string; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      className={`h-9 w-9 items-center justify-center rounded-full border ${disabled ? 'border-gray-200' : 'border-gray-300 bg-gray-50'}`}
    >
      <Text className={`text-lg ${disabled ? 'text-gray-300' : 'text-gray-700'}`}>{symbol}</Text>
    </TouchableOpacity>
  );
}
